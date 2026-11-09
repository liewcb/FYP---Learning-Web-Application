import type { ChatKind } from "@/models/chat/chat.model";

export const videoCallRules = {
  /** Everyone in the call at once, including whoever started it. */
  maxParticipants: 5,
  /** How long a join token is valid for connecting; LiveKit refreshes it while connected. */
  tokenTtl: "10m",
  /** A call nobody has joined for this long after it started counts as ended. */
  abandonedAfterMs: 60_000,
  /** The media server closes an empty room after this many seconds. */
  emptyRoomTimeoutSeconds: 120,
} as const;

/** A call as one of its parties sees it. */
export interface VideoCall {
  readonly id: number;
  readonly conversationId: number;
  readonly kind: ChatKind;
  /** The group name, or the other student(s) of a direct chat. */
  readonly title: string;
  readonly startedByName: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly canJoin: boolean;
  /** Chat members may invite their own study buddies while the call is on. */
  readonly canInvite: boolean;
  /** False for students who were invited individually. */
  readonly isChatMember: boolean;
  /** Chat members and invited students, who cannot be invited again. */
  readonly partyIds: readonly string[];
  readonly invitedNames: readonly string[];
}

/** A study buddy who can be invited into the call. */
export interface VideoCallContact {
  readonly id: string;
  readonly fullName: string;
  readonly initials: string;
  readonly academicLine: string | null;
}

export type SharedDocumentKind = "pdf" | "docx";

/** The document being presented in a call, as viewers see it. */
export interface CallShare {
  readonly id: number;
  readonly sharerId: string;
  readonly sharerName: string;
  readonly title: string;
  readonly fileName: string;
  readonly kind: SharedDocumentKind;
  readonly sizeBytes: number;
  /** Same-site link that checks access and opens the file. */
  readonly fileHref: string;
}

/** A stored presentation, including the private file path. */
export interface CallShareRecord extends Omit<CallShare, "fileHref"> {
  readonly storagePath: string;
}

/** One of the student's own documents that they can present. */
export interface PresentableDocument {
  readonly id: number;
  readonly title: string;
  readonly fileName: string;
  readonly kind: SharedDocumentKind;
  readonly sizeBytes: number;
}

export interface CallShareState {
  readonly share?: CallShare | null;
  readonly error?: string;
}

/**
 * Messages on the call's data channel. The presenter sends where they are;
 * "changed" asks everyone to reload the presentation from the server, and
 * a viewer who joins late sends "sync_request" to get the position.
 */
export type CallShareMessage =
  | {
      readonly type: "position";
      readonly shareId: number;
      /** PDF page, from 1. */
      readonly page: number;
      /** DOCX scroll position, 0 (top) to 1 (end). */
      readonly scroll: number;
    }
  | { readonly type: "changed" }
  | { readonly type: "sync_request" };

export const callShareRules = {
  /** The channel topic, so other data messages in the room are ignored. */
  topic: "shared-document",
  /** Scrolling a DOCX sends at most this often. */
  scrollThrottleMs: 150,
  /** The presenter repeats their position, so anyone who missed a message catches up. */
  heartbeatMs: 5_000,
  /** Safety net if the call's data channel fails: ask the server what is presented. */
  pollMs: 15_000,
  minZoom: 0.5,
  maxZoom: 3,
  zoomStep: 0.25,
} as const;

export type VideoCallPageState =
  | {
      readonly status: "ready";
      readonly call: VideoCall;
      /** The student's identity in the call. */
      readonly viewerId: string;
      readonly serverUrl: string;
      readonly token: string;
      readonly contacts: readonly VideoCallContact[];
      readonly share: CallShare | null;
      readonly documents: readonly PresentableDocument[];
    }
  | {
      readonly status: "ended" | "full" | "not_found" | "unavailable";
      readonly call: VideoCall | null;
    };

export interface VideoCallOpenState {
  readonly callId?: number;
  readonly error?: string;
}

export interface VideoCallInviteState {
  readonly notice?: string;
  readonly error?: string;
}

/** The media-server room for a call. */
export function videoRoomName(callId: number): string {
  return `call-${callId}`;
}

export function videoCallHref(callId: number): string {
  return `/calls/${callId}`;
}

export function callShareFileHref(callId: number, shareId: number): string {
  return `/calls/${callId}/shared/${shareId}`;
}

export function sharedDocumentKind(mimeType: string): SharedDocumentKind {
  return mimeType === "application/pdf" ? "pdf" : "docx";
}

function isFraction(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Data channel messages come from other browsers, so check their shape. */
export function parseCallShareMessage(value: unknown): CallShareMessage | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const message = value as Record<string, unknown>;

  switch (message.type) {
    case "position":
      return Number.isSafeInteger(message.shareId) &&
        Number.isSafeInteger(message.page) &&
        (message.page as number) >= 1 &&
        isFraction(message.scroll)
        ? {
            type: "position",
            shareId: message.shareId as number,
            page: message.page as number,
            scroll: message.scroll as number,
          }
        : null;
    case "changed":
    case "sync_request":
      return { type: message.type };
    default:
      return null;
  }
}

export function clampZoom(zoom: number): number {
  return Math.min(callShareRules.maxZoom, Math.max(callShareRules.minZoom, zoom));
}

export function startShareError(outcome: string): string | null {
  switch (outcome) {
    case "shared":
      return null;
    case "not_allowed":
      return "You can only present in a call you are part of.";
    case "not_found":
      return "That document could not be found in My Documents.";
    case "rate_limited":
      return "You are changing documents too quickly. Wait a moment and try again.";
    case "unauthenticated":
      return "Your session expired. Sign in and try again.";
    default:
      return "The document could not be presented. Please try again.";
  }
}

/**
 * A call whose media room has closed, and that has had time to be joined.
 * LiveKit closes a room by itself once it has been empty for a while, which
 * is more reliable than its participant count (that can lag behind and read
 * 0 while people are connected, which used to end calls in use).
 */
export function isAbandoned(call: Pick<VideoCall, "startedAt">, roomOpen: boolean, now: number): boolean {
  return !roomOpen && now - Date.parse(call.startedAt) > videoCallRules.abandonedAfterMs;
}

export function openCallError(outcome: string): string | null {
  switch (outcome) {
    case "started":
    case "joined":
      return null;
    case "none":
      return "This call has ended.";
    case "not_allowed":
      return "You cannot start a call in this chat.";
    case "rate_limited":
      return "You have started several calls recently. Wait a while and try again.";
    case "unauthenticated":
      return "Your session expired. Sign in and try again.";
    default:
      return "The call could not be opened. Please try again.";
  }
}

export function inviteCallError(outcome: string): string | null {
  switch (outcome) {
    case "invited":
      return null;
    case "ended":
    case "not_found":
      return "This call has ended.";
    case "not_allowed":
      return "Only members of this chat can invite people to the call.";
    case "not_buddies":
      return "You can only invite your own study buddies.";
    case "already_in":
      return "This student can already join the call.";
    case "full":
      return `Calls can have up to ${videoCallRules.maxParticipants} people.`;
    case "unauthenticated":
      return "Your session expired. Sign in and try again.";
    default:
      return "The invitation could not be sent. Please try again.";
  }
}
