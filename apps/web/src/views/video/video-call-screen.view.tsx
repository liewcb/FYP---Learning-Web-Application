"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import type { DocumentViewers } from "@/interfaces/services/document-viewer.interface";
import type { VideoCallRoom } from "@/interfaces/services/video-room.interface";
import { chatHref } from "@/models/chat/chat.model";
import { formatBytes } from "@/models/profile/profile.model";
import {
  videoCallHref,
  videoCallRules,
  type CallShare,
  type CallShareState,
  type PresentableDocument,
  type VideoCall,
  type VideoCallContact,
  type VideoCallInviteState,
  type VideoCallOpenState,
  type VideoCallPageState,
} from "@/models/video/video-call.model";
import {
  AddPersonIcon,
  BackIcon,
  CloseIcon,
  FileIcon,
  GroupIcon,
  UploadIcon,
} from "@/views/chat/chat-icons.view";
import { SharedDocumentStage } from "@/views/video/shared-document-stage.view";
import { Avatar } from "@/views/shared/avatar.view";

export interface VideoCallActions {
  invite(callId: number, studentId: string): Promise<VideoCallInviteState>;
  open(conversationId: number, start: boolean): Promise<VideoCallOpenState>;
  startShare(callId: number, documentId: number): Promise<CallShareState>;
  stopShare(callId: number): Promise<CallShareState>;
  loadShare(callId: number): Promise<CallShareState>;
  /** Ends the call if the student was the last one in it. */
  leave(callId: number): Promise<void>;
}

interface VideoCallScreenProps {
  readonly state: VideoCallPageState;
  readonly Room: VideoCallRoom;
  readonly viewers: DocumentViewers;
  readonly actions: VideoCallActions;
}

/** How long leaving waits for the server before going back to the chat. */
const leaveWaitMs = 1_500;

type SidePanel = "invite" | "present" | null;

/** The student's own documents, to present one to the call. */
function PresentPanel({
  documents,
  share,
  viewerId,
  onPresent,
  onClose,
}: {
  readonly documents: readonly PresentableDocument[];
  readonly share: CallShare | null;
  readonly viewerId: string;
  readonly onPresent: (document: PresentableDocument) => Promise<string | null>;
  readonly onClose: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function present(document: PresentableDocument) {
    setBusyId(document.id);
    setError(null);

    try {
      const message = await onPresent(document);

      if (message) {
        setError(message);
      } else {
        onClose();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <aside className="call-invite-panel" aria-label="Present a document">
      <header>
        <h2>Present a document</h2>
        <button className="chat-icon-button" type="button" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </header>
      <p className="chat-dialog-note">
        {share && share.sharerId !== viewerId
          ? `${share.sharerName} is presenting. Yours will replace it.`
          : "Everyone sees it beside the video, on your page."}
      </p>
      {error ? (
        <p className="chat-composer-error" role="alert">
          {error}
        </p>
      ) : null}
      {documents.length > 0 ? (
        <ul className="chat-contact-list">
          {documents.map((document) => (
            <li className="chat-group-member" key={document.id}>
              <span className="chat-avatar chat-avatar-action" aria-hidden="true">
                <FileIcon />
              </span>
              <span className="chat-contact-text">
                <strong>{document.title}</strong>
                <small>
                  {document.kind.toUpperCase()} · {formatBytes(document.sizeBytes)}
                </small>
              </span>
              <button
                className="button button-outline chat-group-small-button"
                type="button"
                disabled={busyId !== null}
                onClick={() => void present(document)}
              >
                {busyId === document.id ? "Opening..." : "Present"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="chat-dialog-empty">
          You have no documents yet. <Link href="/documents/manage">Upload one in My Documents</Link>
        </p>
      )}
    </aside>
  );
}

const statusCopy = {
  ended: {
    title: "This call has ended",
    body: "Everyone has left the call.",
  },
  full: {
    title: "This call is full",
    body: `Calls can have up to ${videoCallRules.maxParticipants} people. Try again when someone leaves.`,
  },
  not_found: {
    title: "Call not found",
    body: "This call does not exist, or you are not a member of its chat and were not invited.",
  },
  unavailable: {
    title: "Video calls are not available",
    body: "The call service could not be reached. Please try again in a moment.",
  },
} as const;

/** Where "Back" and leaving the call go: the chat, for its members. */
function backHref(call: VideoCall | null): string {
  return call?.isChatMember ? chatHref(call.conversationId) : "/chats";
}

/** Study buddies the student can still invite while the call is on. */
function InvitePanel({
  call,
  contacts,
  invite,
  onClose,
}: {
  readonly call: VideoCall;
  readonly contacts: readonly VideoCallContact[];
  readonly invite: VideoCallActions["invite"];
  readonly onClose: () => void;
}) {
  const [invited, setInvited] = useState<readonly string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ readonly text: string; readonly error: boolean } | null>(null);
  const placesLeft = videoCallRules.maxParticipants - call.partyIds.length - invited.length;

  async function send(contact: VideoCallContact) {
    setBusyId(contact.id);
    setMessage(null);

    try {
      const result = await invite(call.id, contact.id);

      if (result.error) {
        setMessage({ text: result.error, error: true });
      } else {
        setInvited((current) => [...current, contact.id]);
        setMessage({ text: `${contact.fullName} was invited.`, error: false });
      }
    } catch {
      setMessage({ text: "The invitation could not be sent. Please try again.", error: true });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <aside className="call-invite-panel" aria-label="Invite to call">
      <header>
        <h2>Invite to call</h2>
        <button className="chat-icon-button" type="button" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </header>
      <p className="chat-dialog-note">
        {placesLeft > 0
          ? `${placesLeft} place${placesLeft === 1 ? "" : "s"} left. Invitees get a link to join.`
          : `The call has reached ${videoCallRules.maxParticipants} people.`}
      </p>
      {message ? (
        <p className={message.error ? "chat-composer-error" : "call-invite-notice"} role="status">
          {message.text}
        </p>
      ) : null}
      {contacts.length > 0 ? (
        <ul className="chat-contact-list">
          {contacts.map((contact) => {
            const done = invited.includes(contact.id);

            return (
              <li className="chat-group-member" key={contact.id}>
                <Avatar className="chat-avatar" initials={contact.initials} url={contact.avatarUrl} />
                <span className="chat-contact-text">
                  <strong>{contact.fullName}</strong>
                  <small>{contact.academicLine ?? ""}</small>
                </span>
                <button
                  className="button button-outline chat-group-small-button"
                  type="button"
                  disabled={done || busyId !== null || placesLeft <= 0}
                  onClick={() => void send(contact)}
                >
                  {done ? "Invited" : busyId === contact.id ? "Inviting..." : "Invite"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="chat-dialog-empty">
          All your study buddies are already in this call. <Link href="/study-buddy">Find study buddies</Link>
        </p>
      )}
    </aside>
  );
}

export function VideoCallScreen({ state, Room, viewers, actions }: VideoCallScreenProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<SidePanel>(null);
  const [share, setShare] = useState<CallShare | null>(
    state.status === "ready" ? state.share : null,
  );
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const call = state.call;
  const back = backHref(call);
  const callId = call?.id ?? null;

  const refreshShare = useCallback(async () => {
    if (callId === null) {
      return;
    }

    const result = await actions.loadShare(callId);

    if (!result.error) {
      setShare(result.share ?? null);
    }
  }, [actions, callId]);

  // Stable, so the stage's channel subscription is not recreated each render.
  const refreshShareNow = useCallback(() => void refreshShare(), [refreshShare]);

  const stopShare = useCallback(async (): Promise<string | null> => {
    if (callId === null) {
      return null;
    }

    const result = await actions.stopShare(callId);

    if (result.error) {
      return result.error;
    }

    setShare(null);
    return null;
  }, [actions, callId]);

  /** Tell the server first, so the chat shows the call as ended, but never wait long. */
  async function leaveCall() {
    if (callId !== null) {
      await Promise.race([
        actions.leave(callId).catch(() => undefined),
        new Promise((resolve) => window.setTimeout(resolve, leaveWaitMs)),
      ]);
    }

    router.push(back);
  }

  async function present(document: PresentableDocument): Promise<string | null> {
    if (callId === null) {
      return "The document could not be presented.";
    }

    const result = await actions.startShare(callId, document.id);

    if (result.error || !result.share) {
      return result.error ?? "The document could not be presented.";
    }

    setShare(result.share);
    return null;
  }

  async function startNewCall() {
    if (!call) {
      return;
    }

    setStarting(true);
    setStartError(null);

    try {
      const result = await actions.open(call.conversationId, true);

      if (result.callId !== undefined) {
        router.push(videoCallHref(result.callId));
      } else {
        setStartError(result.error ?? "The call could not be started.");
      }
    } finally {
      setStarting(false);
    }
  }

  if (state.status !== "ready") {
    const copy = statusCopy[state.status];

    return (
      <section className="call-status" aria-labelledby="call-status-title">
        <GroupIcon size={40} />
        <h1 id="call-status-title">{copy.title}</h1>
        <p>{copy.body}</p>
        {startError ? <p className="chat-composer-error">{startError}</p> : null}
        <div className="call-status-actions">
          <Link className="button button-outline" href={back}>
            Back to chat
          </Link>
          {state.status === "ended" && call?.isChatMember ? (
            <button
              className="button button-dark"
              type="button"
              disabled={starting}
              onClick={() => void startNewCall()}
            >
              {starting ? "Starting..." : "Start a new call"}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const ready = state.call;
  const viewerId = state.viewerId;

  return (
    <section className={panel ? "call-screen panel-open" : "call-screen"} aria-label={`Video call: ${ready.title}`}>
      <header className="call-header">
        <Link className="chat-icon-button" href={back} aria-label="Back to chat">
          <BackIcon />
        </Link>
        <div className="call-header-text">
          <h1>{ready.title}</h1>
          <p>
            {ready.kind === "group" ? "Group call" : "Video call"} · started by {ready.startedByName}
            {ready.invitedNames.length > 0 ? ` · invited: ${ready.invitedNames.join(", ")}` : ""}
          </p>
        </div>
        <button
          className="button button-outline call-invite-button"
          type="button"
          onClick={() => setPanel((current) => (current === "present" ? null : "present"))}
          aria-expanded={panel === "present"}
        >
          <UploadIcon />
          Present
        </button>
        {ready.canInvite ? (
          <button
            className="button button-outline call-invite-button"
            type="button"
            onClick={() => setPanel((current) => (current === "invite" ? null : "invite"))}
            aria-expanded={panel === "invite"}
          >
            <AddPersonIcon />
            Invite
          </button>
        ) : null}
      </header>

      <div className="call-body">
        <div className="call-stage">
          <Room
            serverUrl={state.serverUrl}
            token={state.token}
            onLeave={() => void leaveCall()}
            renderStage={(channel) => (
              <SharedDocumentStage
                channel={channel}
                viewerId={viewerId}
                share={share}
                viewers={viewers}
                onRefresh={refreshShareNow}
                onStop={stopShare}
              />
            )}
          />
        </div>
        {panel === "invite" ? (
          <InvitePanel
            call={ready}
            contacts={state.contacts}
            invite={actions.invite}
            onClose={() => setPanel(null)}
          />
        ) : null}
        {panel === "present" ? (
          <PresentPanel
            documents={state.documents}
            share={share}
            viewerId={viewerId}
            onPresent={present}
            onClose={() => setPanel(null)}
          />
        ) : null}
      </div>
    </section>
  );
}
