import { studyBuddyInitials } from "@/models/peers/study-buddy.model";
import { formatBytes } from "@/models/profile/profile.model";

export const chatAttachmentTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ChatAttachmentType = (typeof chatAttachmentTypes)[number];

export const chatRules = {
  maxBodyLength: 4000,
  /** Files uploaded from the device; shared documents may be up to 25 MB. */
  maxUploadBytes: 10 * 1024 * 1024,
  pageSize: 50,
  /** Pages refresh presence every 30 s, so two missed beats means offline. */
  onlineWindowMs: 75_000,
  refreshIntervalMs: 30_000,
  typingVisibleMs: 4_000,
  typingThrottleMs: 2_500,
  attachmentAccept: ".pdf,.docx,.png,.jpg,.jpeg,.webp",
} as const;

/**
 * Dates are shown in Malaysian time on both the server and the browser, so
 * server-rendered labels match the hydrated page.
 */
export const chatTimeZone = "Asia/Kuala_Lumpur";

/** Fired on window when chats change, so the navigation badge refreshes. */
export const chatsChangedEvent = "athenix:chats-changed";

const attachmentTypes = new Set<string>(chatAttachmentTypes);

export function isChatAttachmentType(value: string): value is ChatAttachmentType {
  return attachmentTypes.has(value);
}

export interface ChatParticipant {
  readonly id: string;
  readonly fullName: string;
  readonly username: string | null;
  readonly initials: string;
  readonly academicLine: string | null;
  /** Null when hidden (no longer buddies) or never recorded. */
  readonly lastSeenAt: string | null;
}

export interface ChatReceipt {
  readonly lastDeliveredAt: string | null;
  readonly lastReadAt: string | null;
}

/** Membership changes posted into a group as event messages. */
export const chatEvents = [
  "group_created",
  "member_joined",
  "member_left",
  "member_removed",
  "group_renamed",
  "admin_changed",
  "group_disbanded",
  "call_started",
] as const;

export type ChatEvent = (typeof chatEvents)[number];

export function isChatEvent(value: unknown): value is ChatEvent {
  return typeof value === "string" && (chatEvents as readonly string[]).includes(value);
}

export interface ChatLastMessage {
  readonly id: number;
  readonly senderId: string;
  /** Shown before group messages ("Aina: …"). */
  readonly senderName: string;
  readonly body: string;
  readonly attachmentName: string | null;
  readonly deleted: boolean;
  readonly event: ChatEvent | null;
  readonly eventUserId: string | null;
  readonly eventUserName: string | null;
  readonly createdAt: string;
}

export type ChatKind = "direct" | "group";

export const chatGroupRules = {
  /** Including the admin. */
  maxMembers: 5,
  maxTitleLength: 60,
} as const;

export interface ChatGroup {
  readonly title: string;
  readonly initials: string;
  readonly adminId: string | null;
  /** Current members, including the viewer while they belong to it. */
  readonly memberCount: number;
  readonly disbanded: boolean;
  /** Why the viewer is no longer a member, or null while they are. */
  readonly leftReason: "left" | "removed" | null;
}

/** One row of the chat list. */
export interface ChatSummary {
  readonly id: number;
  readonly kind: ChatKind;
  /** The other student of a direct chat; null for groups. */
  readonly other: ChatParticipant | null;
  /** Null for direct chats. */
  readonly group: ChatGroup | null;
  /**
   * Direct: false once the students are no longer study buddies, or either
   * blocked the other. Group: false once the viewer left or it was disbanded.
   */
  readonly canSend: boolean;
  readonly isBuddy: boolean;
  readonly blockedByMe: boolean;
  readonly blockedMe: boolean;
  /** The viewer's own settings for this chat. */
  readonly pinnedAt: string | null;
  readonly muted: boolean;
  readonly clearedAt: string | null;
  /** Deleted by the viewer and no newer message since. */
  readonly hidden: boolean;
  readonly myLastReadAt: string | null;
  /** In a group, the receipt of the slowest current member. */
  readonly otherReceipt: ChatReceipt;
  readonly lastMessage: ChatLastMessage | null;
  readonly unreadCount: number;
  readonly createdAt: string;
}

/** A member, former member or invited student of a group. */
export interface ChatGroupMember {
  readonly id: string;
  readonly fullName: string;
  readonly username: string | null;
  readonly initials: string;
  readonly academicLine: string | null;
  /** Shared between study buddies only. */
  readonly lastSeenAt: string | null;
  readonly isBuddy: boolean;
  readonly status: "member" | "left" | "removed" | "invited";
  /** Set for invited students, so the admin can cancel the invitation. */
  readonly inviteId: number | null;
  /** When they joined, or were invited. */
  readonly since: string;
}

/** An invitation waiting for the viewer's answer. */
export interface ChatGroupInvite {
  readonly id: number;
  readonly groupId: number;
  readonly title: string;
  readonly initials: string;
  readonly inviterName: string;
  readonly memberCount: number;
  readonly createdAt: string;
}

export interface ChatAttachment {
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Short-lived link for inline image previews; null for documents. */
  readonly previewUrl: string | null;
}

export interface ChatReplyPreview {
  readonly id: number;
  readonly senderId: string;
  readonly body: string;
  readonly attachmentName: string | null;
  readonly deleted: boolean;
}

/** A message as the browser sees it. Storage paths stay on the server. */
export interface ChatMessage {
  readonly id: number;
  readonly conversationId: number;
  readonly senderId: string;
  readonly body: string;
  readonly replyTo: ChatReplyPreview | null;
  readonly attachment: ChatAttachment | null;
  /** Set on group membership events; the sender is who acted. */
  readonly event: ChatEvent | null;
  /** The student an event is about, e.g. who was removed. */
  readonly eventUserId: string | null;
  /** The call a "started a video call" message is about. */
  readonly call: ChatCall | null;
  readonly createdAt: string;
  readonly deletedAt: string | null;
}

export interface ChatCall {
  readonly id: number;
  /** Null while the call is going on. */
  readonly endedAt: string | null;
}

/** "12 min", "1 h 5 min", "under a minute": how long an ended call lasted. */
export function callDurationLabel(startedAt: string, endedAt: string): string {
  const minutes = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000);

  if (minutes < 1) {
    return "under a minute";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** A stored message, including the private attachment path. */
export interface ChatMessageRecord extends Omit<ChatMessage, "attachment"> {
  readonly attachment: (Omit<ChatAttachment, "previewUrl"> & { readonly path: string }) | null;
}

export interface ActiveChat {
  readonly summary: ChatSummary;
  /** Oldest first. */
  readonly messages: readonly ChatMessage[];
  readonly hasMore: boolean;
  /** The first message that was unread when the chat was opened. */
  readonly firstUnreadId: number | null;
  /** Group members, former members and invitations; empty for direct chats. */
  readonly members: readonly ChatGroupMember[];
}

/** A study buddy who can be messaged from the New chat dialog. */
export interface ChatContact {
  readonly id: string;
  readonly fullName: string;
  readonly username: string | null;
  readonly initials: string;
  readonly academicLine: string | null;
}

/** One of the student's own documents that can be shared into a chat. */
export interface ShareableDocument {
  readonly id: number;
  readonly title: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface ChatPageModel {
  readonly viewerId: string;
  readonly generatedAt: string;
  readonly conversations: readonly ChatSummary[];
  readonly invites: readonly ChatGroupInvite[];
  readonly active: ActiveChat | null;
  readonly contacts: readonly ChatContact[];
  readonly documents: readonly ShareableDocument[];
  readonly notice: string | null;
}

export interface ChatSyncResult {
  readonly summary: ChatSummary;
  readonly messages: readonly ChatMessage[];
}

export interface ChatListRefresh {
  readonly conversations: readonly ChatSummary[];
  readonly invites: readonly ChatGroupInvite[];
}

export interface ChatOlderMessages {
  readonly messages: readonly ChatMessage[];
  readonly hasMore: boolean;
}

export interface ChatSendState {
  readonly message?: ChatMessage;
  readonly error?: string;
}

export interface ChatDeleteState {
  readonly error?: string;
}

export interface ChatSaveState {
  readonly notice?: string;
  readonly error?: string;
}

/** Per-chat actions from the chat list menu and the contact-info panel. */
export const chatSettingActions = [
  "pin",
  "unpin",
  "mute",
  "unmute",
  "clear",
  "delete",
  "block",
  "unblock",
] as const;

export type ChatSettingAction = (typeof chatSettingActions)[number];

export function isChatSettingAction(value: unknown): value is ChatSettingAction {
  return typeof value === "string" && (chatSettingActions as readonly string[]).includes(value);
}

export const chatPinLimit = 3;

export interface ChatActionState {
  readonly error?: string;
}

export const chatReportReasons = [
  { value: "spam", label: "Spam or advertising" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "inappropriate", label: "Inappropriate or offensive content" },
  { value: "impersonation", label: "Pretending to be someone else" },
  { value: "other", label: "Something else" },
] as const;

export type ChatReportReason = (typeof chatReportReasons)[number]["value"];

export function isChatReportReason(value: unknown): value is ChatReportReason {
  return chatReportReasons.some((reason) => reason.value === value);
}

export const chatReportDetailsMaxLength = 1000;

export type ChatReportOutcome = "reported" | "duplicate" | "invalid" | "not_found" | "unauthenticated";

/** Group management requests from the group info panel. */
export type ChatGroupCommand =
  | { readonly type: "invite"; readonly studentId: string }
  | { readonly type: "cancel_invite"; readonly inviteId: number }
  | { readonly type: "remove"; readonly studentId: string }
  | { readonly type: "make_admin"; readonly studentId: string }
  | { readonly type: "rename"; readonly title: string }
  | { readonly type: "leave" }
  | { readonly type: "disband" };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStudentId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

/** Validates a command received by a Server Action. */
export function parseGroupCommand(value: unknown): ChatGroupCommand | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const command = value as Record<string, unknown>;

  switch (command.type) {
    case "invite":
    case "remove":
    case "make_admin":
      return isStudentId(command.studentId)
        ? { type: command.type, studentId: command.studentId }
        : null;
    case "cancel_invite": {
      const inviteId = parseChatId(command.inviteId);
      return inviteId === null ? null : { type: "cancel_invite", inviteId };
    }
    case "rename":
      return typeof command.title === "string" ? { type: "rename", title: command.title } : null;
    case "leave":
    case "disband":
      return { type: command.type };
    default:
      return null;
  }
}

export interface ChatGroupCreateState {
  readonly groupId?: number;
  readonly error?: string;
}

export interface ChatInviteResponseState {
  readonly groupId?: number;
  readonly notice?: string;
  readonly error?: string;
}

/** Checks a group name before it is sent; null when it is fine. */
export function validateGroupTitle(title: string): string | null {
  const trimmed = title.trim();

  if (!trimmed) {
    return "Give the group a name.";
  }

  return trimmed.length > chatGroupRules.maxTitleLength
    ? `Group names can be up to ${chatGroupRules.maxTitleLength} characters.`
    : null;
}

/** Error text for a group database outcome, or null on success. */
export function groupOutcomeError(outcome: string): string | null {
  switch (outcome) {
    case "created":
    case "invited":
    case "cancelled":
    case "joined":
    case "declined":
    case "left":
    case "done":
      return null;
    case "invalid_title":
      return validateGroupTitle("") ?? "Choose a different group name.";
    case "no_members":
      return "Choose at least one study buddy to invite.";
    case "too_many":
    case "full":
      return `Groups can have up to ${chatGroupRules.maxMembers} members, including invitations.`;
    case "not_buddies":
      return "You can invite your own study buddies, or students who were in this group before.";
    case "already_member":
      return "This student is already in the group.";
    case "already_invited":
      return "This student has already been invited.";
    case "recently_declined":
      return "This student declined recently. Try again tomorrow.";
    case "not_admin":
      return "Only the group admin can do that.";
    case "closed":
      return "This group has been disbanded.";
    case "rate_limited":
      return "You have created several groups recently. Wait a while and try again.";
    case "unauthenticated":
      return "Your session expired. Sign in and try again.";
    default:
      return "This group could not be updated.";
  }
}

export interface ChatReportState {
  readonly notice?: string;
  readonly error?: string;
}

/** Extra details for the contact-info panel. */
export interface ChatProfileDetails {
  readonly bio: string | null;
  readonly interests: readonly string[];
  readonly memberSince: string | null;
  /** Files shared in the chat, newest first. */
  readonly files: readonly ChatSharedFile[];
}

export interface ChatSharedFile {
  readonly messageId: number;
  readonly senderId: string;
  readonly createdAt: string;
  readonly attachment: ChatAttachment;
}

export interface ChatSearchResult {
  readonly messageId: number;
  readonly senderId: string;
  readonly body: string;
  readonly createdAt: string;
}

export const chatSearchRules = {
  minLength: 2,
  maxLength: 100,
  maxResults: 50,
  debounceMs: 300,
} as const;

export interface SendChatMessageInput {
  readonly conversationId: number;
  readonly body: string;
  readonly replyToId: number | null;
  readonly attachment: {
    readonly path: string;
    readonly name: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
  } | null;
}

/** Outcomes returned by the chat database functions. */
export type ChatSendOutcome =
  | "sent"
  | "not_found"
  | "not_buddies"
  | "blocked"
  | "not_member"
  | "closed"
  | "empty"
  | "too_long"
  | "invalid_attachment"
  | "invalid_reply"
  | "rate_limited"
  | "unauthenticated";

export type ChatDeleteOutcome = "deleted" | "not_found" | "unauthenticated";

export const chatSendOutcomes: readonly ChatSendOutcome[] = [
  "sent",
  "not_found",
  "not_buddies",
  "blocked",
  "not_member",
  "closed",
  "empty",
  "too_long",
  "invalid_attachment",
  "invalid_reply",
  "rate_limited",
  "unauthenticated",
];

export const chatDeleteOutcomes: readonly ChatDeleteOutcome[] = [
  "deleted",
  "not_found",
  "unauthenticated",
];

export function sendOutcomeError(outcome: ChatSendOutcome): string | null {
  switch (outcome) {
    case "sent":
      return null;
    case "not_found":
      return "This chat could not be found.";
    case "not_buddies":
      return "You can only message students who are your study buddies.";
    case "blocked":
      return "Messages cannot be sent in this chat.";
    case "not_member":
      return "You are no longer a member of this group.";
    case "closed":
      return "This group has been disbanded.";
    case "empty":
      return "Type a message or attach a file.";
    case "too_long":
      return `Messages can be up to ${chatRules.maxBodyLength} characters.`;
    case "invalid_attachment":
      return "The attachment could not be sent. Please try again.";
    case "invalid_reply":
      return "The message you replied to is no longer available.";
    case "rate_limited":
      return "You are sending messages too quickly. Wait a moment and try again.";
    case "unauthenticated":
      return "Your session expired. Sign in and try again.";
  }
}

/** Realtime change to a chat_messages row. */
export interface ChatMessageEvent {
  readonly id: number;
  readonly conversationId: number;
  readonly senderId: string;
  readonly body: string;
  readonly attachmentName: string | null;
  readonly event: ChatEvent | null;
  readonly callId: number | null;
  readonly callEndedAt: string | null;
  readonly createdAt: string;
  readonly deletedAt: string | null;
}

/** Realtime change to a chat_members row. */
export interface ChatReceiptEvent {
  readonly conversationId: number;
  readonly userId: string;
  readonly lastDeliveredAt: string | null;
  readonly lastReadAt: string | null;
}

export function academicLine(
  major: string | null,
  yearOfStudy: number | null,
): string | null {
  const line = [major?.trim() || null, yearOfStudy === null ? null : `Year ${yearOfStudy}`]
    .filter(Boolean)
    .join(" · ");

  return line || null;
}

export function participantName(fullName: string, username: string | null): string {
  return fullName.trim() || username || "Student";
}

export function participantInitials(fullName: string, username: string | null): string {
  return studyBuddyInitials(fullName, username);
}

function activityTime(chat: ChatSummary): number {
  return Date.parse(chat.lastMessage?.createdAt ?? chat.createdAt);
}

/** Pinned chats first (most recently pinned on top), then latest activity. */
export function compareChats(a: ChatSummary, b: ChatSummary): number {
  if (a.pinnedAt || b.pinnedAt) {
    if (!a.pinnedAt) {
      return 1;
    }

    if (!b.pinnedAt) {
      return -1;
    }

    return Date.parse(b.pinnedAt) - Date.parse(a.pinnedAt);
  }

  return activityTime(b) - activityTime(a);
}

/**
 * Whether a chat appears in the list: it has a message (like WhatsApp), or
 * was cleared and is kept empty. Deleted chats return with the next message.
 */
export function isListedChat(chat: ChatSummary): boolean {
  return !chat.hidden && (chat.lastMessage !== null || chat.clearedAt !== null);
}

/** The name shown for a chat: the other student, or the group. */
export function chatName(chat: ChatSummary): string {
  return chat.group?.title ?? chat.other?.fullName ?? "Chat";
}

export function chatInitials(chat: ChatSummary): string {
  return chat.group?.initials ?? chat.other?.initials ?? "";
}

export function groupInitials(title: string): string {
  return participantInitials(title, null);
}

export function isGroupAdmin(chat: ChatSummary, viewerId: string): boolean {
  return chat.group !== null && chat.group.adminId === viewerId && chat.canSend;
}

/** A current member of a group that still exists. */
export function isActiveGroupMember(chat: ChatSummary): boolean {
  return chat.group !== null && chat.group.leftReason === null && !chat.group.disbanded;
}

export type ReadOnlyReason =
  | "blocked_by_me"
  | "blocked_me"
  | "not_buddies"
  | "left"
  | "removed"
  | "disbanded";

/** Why the composer is replaced by a notice, or null when sending is allowed. */
export function readOnlyReason(chat: ChatSummary): ReadOnlyReason | null {
  if (chat.canSend) {
    return null;
  }

  if (chat.group) {
    return chat.group.leftReason ?? "disbanded";
  }

  if (chat.blockedByMe) {
    return "blocked_by_me";
  }

  return chat.blockedMe ? "blocked_me" : "not_buddies";
}

/** Current members first (admin on top), then invitations, then former members. */
export function sortGroupMembers(
  members: readonly ChatGroupMember[],
  adminId: string | null,
): ChatGroupMember[] {
  const rank = (member: ChatGroupMember) =>
    member.status === "member" ? (member.id === adminId ? 0 : 1) : member.status === "invited" ? 2 : 3;

  return [...members].sort(
    (a, b) => rank(a) - rank(b) || Date.parse(a.since) - Date.parse(b.since),
  );
}

/** Looks up display names for the senders of a group's messages. */
export function memberNames(members: readonly ChatGroupMember[]): ReadonlyMap<string, string> {
  return new Map(
    members.filter((member) => member.status !== "invited").map((member) => [member.id, member.fullName]),
  );
}

/** "You, Aina, Wei" under the group name. */
export function groupMembersLine(
  members: readonly ChatGroupMember[],
  viewerId: string,
): string {
  const current = members.filter((member) => member.status === "member");
  const others = current.filter((member) => member.id !== viewerId).map((member) => member.fullName);

  return (current.some((member) => member.id === viewerId) ? ["You", ...others] : others).join(", ");
}

/** "Aina removed Wei" for an event message. */
export function chatEventText(
  event: ChatEvent,
  options: {
    readonly actorName: string;
    readonly targetName: string | null;
    readonly body: string;
    readonly actorIsViewer: boolean;
    readonly targetIsViewer: boolean;
  },
): string {
  const actor = options.actorIsViewer ? "You" : options.actorName;
  const target = options.targetIsViewer ? "you" : (options.targetName ?? "a member");

  switch (event) {
    case "group_created":
      return `${actor} created the group “${options.body}”`;
    case "member_joined":
      return `${actor} joined`;
    case "member_left":
      return `${actor} left`;
    case "member_removed":
      return `${actor} removed ${target}`;
    case "group_renamed":
      return `${actor} renamed the group to “${options.body}”`;
    case "admin_changed":
      return options.targetIsViewer ? "You are now the group admin" : `${options.targetName ?? "A member"} is now the group admin`;
    case "group_disbanded":
      return `${actor} disbanded the group`;
    case "call_started":
      return `${actor} started a video call`;
  }
}

export type TickStatus = "sent" | "delivered" | "read";

/** Ticks for one of the viewer's own messages. */
export function tickStatus(createdAt: string, receipt: ChatReceipt): TickStatus {
  const sentAt = Date.parse(createdAt);

  if (receipt.lastReadAt && Date.parse(receipt.lastReadAt) >= sentAt) {
    return "read";
  }

  if (receipt.lastDeliveredAt && Date.parse(receipt.lastDeliveredAt) >= sentAt) {
    return "delivered";
  }

  return "sent";
}

const timeFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: chatTimeZone,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: chatTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const weekdayFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: chatTimeZone,
  weekday: "long",
});
const shortDateFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: chatTimeZone,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const longDateFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: chatTimeZone,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dayMs = 24 * 60 * 60 * 1000;

function dayKey(time: number): string {
  return dayKeyFormatter.format(new Date(time));
}

/** Calendar days between two instants in Malaysian time (0 = same day). */
function daysAgo(time: number, now: number): number {
  const [a, b] = [dayKey(time), dayKey(now)].map((key) => Date.parse(`${key}T00:00:00Z`));

  return Math.round((b - a) / dayMs);
}

/** "8:14 pm" */
export function formatChatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** Time in the chat list: today's time, Yesterday, a weekday or a date. */
export function formatListTime(iso: string, now: number): string {
  const time = Date.parse(iso);
  const days = daysAgo(time, now);

  if (days <= 0) {
    return formatChatTime(iso);
  }

  if (days === 1) {
    return "Yesterday";
  }

  return days < 7 ? weekdayFormatter.format(new Date(time)) : shortDateFormatter.format(new Date(time));
}

/** Date separator between messages. */
export function formatDayLabel(iso: string, now: number): string {
  const time = Date.parse(iso);
  const days = daysAgo(time, now);

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  return days < 7 ? weekdayFormatter.format(new Date(time)) : longDateFormatter.format(new Date(time));
}

export function isSameChatDay(a: string, b: string): boolean {
  return dayKey(Date.parse(a)) === dayKey(Date.parse(b));
}

export interface Presence {
  readonly online: boolean;
  readonly label: string;
}

export function presence(lastSeenAt: string | null, now: number): Presence {
  if (!lastSeenAt) {
    return { online: false, label: "" };
  }

  const seen = Date.parse(lastSeenAt);

  if (now - seen <= chatRules.onlineWindowMs) {
    return { online: true, label: "online" };
  }

  const days = daysAgo(seen, now);
  const time = formatChatTime(lastSeenAt);

  if (days <= 0) {
    return { online: false, label: `last seen today at ${time}` };
  }

  if (days === 1) {
    return { online: false, label: `last seen yesterday at ${time}` };
  }

  return { online: false, label: `last seen ${shortDateFormatter.format(new Date(seen))}` };
}

/** Text shown under a name in the chat list. */
export function lastMessagePreview(
  message: ChatLastMessage | null,
  viewerId: string,
  cleared = false,
  isGroup = false,
): string {
  if (!message) {
    return cleared || isGroup ? "" : "You are now study buddies. Say hi!";
  }

  const mine = message.senderId === viewerId;

  if (message.event) {
    return chatEventText(message.event, {
      actorName: message.senderName,
      targetName: message.eventUserName,
      body: message.body,
      actorIsViewer: mine,
      targetIsViewer: message.eventUserId === viewerId,
    });
  }

  if (message.deleted) {
    return mine ? "You deleted this message" : "This message was deleted";
  }

  const text = message.body.trim() || message.attachmentName || "Attachment";

  // Groups say who wrote it; the viewer's own messages already show ticks.
  return isGroup && !mine && message.senderName ? `${message.senderName}: ${text}` : text;
}

export function replyPreviewText(reply: ChatReplyPreview): string {
  if (reply.deleted) {
    return "This message was deleted";
  }

  return reply.body.trim() || reply.attachmentName || "Attachment";
}

export type ChatAttachmentKind = "image" | "pdf" | "docx";

export function attachmentKind(mimeType: string): ChatAttachmentKind {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  return mimeType === "application/pdf" ? "pdf" : "docx";
}

/** My Documents accepts PDF and DOCX only, so images can just be downloaded. */
export function canSaveToDocuments(mimeType: string): boolean {
  return attachmentKind(mimeType) !== "image";
}

/** Document title for a saved attachment: its file name without the extension. */
export function documentTitleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim().slice(0, 200) || "Shared document";
}

export function attachmentLabel(attachment: { mimeType: string; sizeBytes: number }): string {
  const kind = attachmentKind(attachment.mimeType);
  const type = kind === "image" ? "Image" : kind.toUpperCase();

  return `${type} · ${formatBytes(attachment.sizeBytes)}`;
}

export function chatAttachmentHref(messageId: number): string {
  return `/chats/attachments/${messageId}`;
}

export function chatHref(conversationId: number): string {
  return `/chats?c=${conversationId}`;
}

export function chatWithHref(studentId: string): string {
  return `/chats?with=${studentId}`;
}

/** Checks a file chosen from the device before it is uploaded. */
export function validateChatUpload(file: { type: string; size: number }): string | null {
  if (!isChatAttachmentType(file.type)) {
    return "Attach a PDF, DOCX, PNG, JPG or WebP file.";
  }

  if (file.size <= 0) {
    return "This file is empty.";
  }

  if (file.size > chatRules.maxUploadBytes) {
    return "Files must be 10 MB or smaller.";
  }

  return null;
}

export function normaliseChatBody(body: string): string {
  return body.replace(/\r\n/g, "\n").trim();
}

export function parseChatId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
