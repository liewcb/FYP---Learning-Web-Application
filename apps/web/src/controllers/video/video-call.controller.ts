import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import type { StudyBuddyRepository } from "@/interfaces/repositories/study-buddy.repository";
import type { VideoCallRepository } from "@/interfaces/repositories/video-call.repository";
import type { DocumentStorage } from "@/interfaces/services/document-storage.interface";
import type { VideoRoomService } from "@/interfaces/services/video-room.interface";
import { academicLine, isStudentId } from "@/models/chat/chat.model";
import {
  callShareFileHref,
  inviteCallError,
  isAbandoned,
  openCallError,
  sharedDocumentKind,
  startShareError,
  videoCallRules,
  videoRoomName,
  type CallShare,
  type CallShareRecord,
  type CallShareState,
  type PresentableDocument,
  type VideoCall,
  type VideoCallContact,
  type VideoCallInviteState,
  type VideoCallOpenState,
  type VideoCallPageState,
} from "@/models/video/video-call.model";

const notConfigured = "Video calls are not available right now.";

export class VideoCallController {
  constructor(
    private readonly calls: VideoCallRepository,
    private readonly rooms: VideoRoomService,
    private readonly buddies: StudyBuddyRepository,
    private readonly documents: DocumentRepository,
    /**
     * Signs links to presented files, which belong to the presenter, so it
     * runs with server privileges; created only when a file is opened.
     */
    private readonly presentedFiles: () => DocumentStorage,
  ) {}

  /** Joins the chat's call in progress, or starts one when `start` is true. */
  async open(conversationId: number, start: boolean): Promise<VideoCallOpenState> {
    if (!this.rooms.serverUrl) {
      return { error: notConfigured };
    }

    try {
      let result = await this.calls.open(conversationId, false);

      // A call everyone has left is closed first, so a new one can start.
      if (result.outcome === "joined" && result.callId !== null) {
        const call = await this.calls.find(result.callId);

        if (call && (await this.endIfAbandoned(call))) {
          result = { outcome: "none", callId: null };
        }
      }

      if (result.outcome === "none" && start) {
        result = await this.calls.open(conversationId, true);
      }

      const error = openCallError(result.outcome);

      return error || result.callId === null
        ? { error: error ?? openCallError("")! }
        : { callId: result.callId };
    } catch (error) {
      console.error("Opening video call failed.", error);
      return { error: openCallError("")! };
    }
  }

  /** Everything the call page needs, including a fresh join token. */
  async prepareJoin(
    callId: number,
    viewer: { readonly id: string; readonly displayName: string },
  ): Promise<VideoCallPageState> {
    const call = await this.calls.find(callId);

    if (!call) {
      return { status: "not_found", call: null };
    }

    if (!call.canJoin) {
      return { status: call.endedAt ? "ended" : "not_found", call };
    }

    if (!this.rooms.serverUrl) {
      return { status: "unavailable", call };
    }

    try {
      const room = videoRoomName(call.id);
      const [present, roomOpen] = await Promise.all([
        this.rooms.participantIdentities(room),
        this.rooms.roomIsOpen(room),
      ]);

      if (isAbandoned(call, roomOpen, Date.now())) {
        await this.calls.end(call.id);
        return { status: "ended", call: { ...call, endedAt: new Date().toISOString(), canJoin: false } };
      }

      // Someone reconnecting from another tab still fits.
      if (!present.includes(viewer.id) && present.length >= videoCallRules.maxParticipants) {
        return { status: "full", call };
      }

      await this.rooms.prepareRoom(room, videoCallRules.maxParticipants);

      const [token, contacts, share, documents] = await Promise.all([
        this.rooms.createJoinToken({ room, identity: viewer.id, name: viewer.displayName }),
        call.canInvite ? this.invitableContacts(call) : [],
        this.calls.findShare(call.id),
        this.presentableDocuments(),
      ]);

      return {
        status: "ready",
        call,
        viewerId: viewer.id,
        serverUrl: this.rooms.serverUrl,
        token,
        contacts,
        share: share && this.presentShare(call.id, share),
        documents,
      };
    } catch (error) {
      console.error("Preparing video call failed.", error);
      return { status: "unavailable", call };
    }
  }

  async invite(callId: number, studentId: string): Promise<VideoCallInviteState> {
    if (!isStudentId(studentId)) {
      return { error: inviteCallError("not_buddies")! };
    }

    try {
      const outcome = await this.calls.invite(callId, studentId);
      const error = inviteCallError(outcome);

      return error ? { error } : { notice: "Invitation sent. They will get a notification." };
    } catch (error) {
      console.error("Video call invitation failed.", error);
      return { error: inviteCallError("")! };
    }
  }

  /** Presents one of the student's own documents, replacing any other. */
  async startShare(callId: number, documentId: number): Promise<CallShareState> {
    try {
      const result = await this.calls.startShare(callId, documentId);
      const error = startShareError(result.outcome);

      if (error) {
        return { error };
      }

      return { share: await this.currentShare(callId) };
    } catch (error) {
      console.error("Presenting document failed.", error);
      return { error: startShareError("")! };
    }
  }

  /**
   * The presenter stops their presentation. Anyone else may stop one whose
   * presenter has left the call, so a dropped connection never blocks it.
   */
  async stopShare(callId: number, viewerId: string): Promise<CallShareState> {
    try {
      const share = await this.calls.findShare(callId);

      if (!share) {
        return { share: null };
      }

      let presenterGone = false;

      if (share.sharerId !== viewerId) {
        const present = await this.rooms.participantIdentities(videoRoomName(callId));

        if (present.includes(share.sharerId)) {
          return { error: `${share.sharerName} is still presenting. Only they can stop it.` };
        }

        presenterGone = true;
      }

      await this.calls.stopShare(callId, presenterGone);

      return { share: null };
    } catch (error) {
      console.error("Stopping presentation failed.", error);
      return { error: "The presentation could not be stopped. Please try again." };
    }
  }

  async currentShare(callId: number): Promise<CallShare | null> {
    const share = await this.calls.findShare(callId);

    return share && this.presentShare(callId, share);
  }

  /** A short-lived link to the presented file, or null without access. */
  async sharedFileUrl(callId: number, shareId: number): Promise<string | null> {
    // get_call_share returns the file only to students who may join the call.
    const share = await this.calls.findShare(callId);

    if (!share || share.id !== shareId) {
      return null;
    }

    return this.presentedFiles().createViewUrl(share.storagePath);
  }

  /** Strips the storage path; the browser gets a link that checks access. */
  private presentShare(callId: number, share: CallShareRecord): CallShare {
    return {
      id: share.id,
      sharerId: share.sharerId,
      sharerName: share.sharerName,
      title: share.title,
      fileName: share.fileName,
      kind: share.kind,
      sizeBytes: share.sizeBytes,
      fileHref: callShareFileHref(callId, share.id),
    };
  }

  private async presentableDocuments(): Promise<PresentableDocument[]> {
    // Row-level security returns only the student's own documents.
    const documents = await this.documents.listForCurrentUser();

    return documents.map((document) => ({
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      kind: sharedDocumentKind(document.data.mimeType),
      sizeBytes: document.data.sizeBytes,
    }));
  }

  /** The student left the call: end it now if nobody else is still in the room. */
  async leave(callId: number, viewerId: string): Promise<void> {
    if (!this.rooms.serverUrl) {
      return;
    }

    try {
      // Null unless the student is part of the call.
      const call = await this.calls.find(callId);

      if (!call || call.endedAt) {
        return;
      }

      const others = (await this.rooms.participantIdentities(videoRoomName(callId))).filter(
        (identity) => identity !== viewerId,
      );

      if (others.length === 0) {
        await this.calls.end(callId);
      }
    } catch (error) {
      // Not critical: the next visit to the chat or the call ends it instead.
      console.error("Ending call on leave failed.", error);
    }
  }

  /** For CallSettler: ends calls whose room has closed and says when each ended. */
  async settle(callIds: readonly number[]): Promise<ReadonlyMap<number, string>> {
    const ended = new Map<number, string>();

    if (!this.rooms.serverUrl) {
      return ended;
    }

    await Promise.all(
      callIds.map(async (callId) => {
        try {
          const call = await this.calls.find(callId);

          if (call?.endedAt) {
            ended.set(callId, call.endedAt);
          } else if (call && (await this.endIfAbandoned(call))) {
            ended.set(callId, new Date().toISOString());
          }
        } catch (error) {
          console.error("Checking a call failed.", error);
        }
      }),
    );

    return ended;
  }

  /** Ends a call whose media room has closed because everyone left. */
  private async endIfAbandoned(call: VideoCall): Promise<boolean> {
    if (Date.now() - Date.parse(call.startedAt) <= videoCallRules.abandonedAfterMs) {
      return false;
    }

    const roomOpen = await this.rooms.roomIsOpen(videoRoomName(call.id));

    if (!isAbandoned(call, roomOpen, Date.now())) {
      return false;
    }

    await this.calls.end(call.id);
    return true;
  }

  /** The viewer's study buddies who are not already part of the call. */
  private async invitableContacts(call: VideoCall): Promise<VideoCallContact[]> {
    const party = new Set(call.partyIds);
    const connections = await this.buddies.listConnections();

    return connections
      .filter((buddy) => buddy.connectionStatus === "accepted" && !party.has(buddy.id))
      .map((buddy) => ({
        id: buddy.id,
        fullName: buddy.fullName,
        initials: buddy.initials,
        academicLine: academicLine(buddy.academicMajor, buddy.yearOfStudy),
      }));
  }
}
