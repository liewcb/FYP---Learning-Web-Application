"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from "react";

import {
  chatEventText,
  chatInitials,
  chatName,
  formatChatTime,
  formatDayLabel,
  groupMembersLine,
  isSameChatDay,
  presence,
  readOnlyReason,
  tickStatus,
  type ChatGroupMember,
  type ChatMessage,
  type ChatSummary,
} from "@/models/chat/chat.model";
import {
  BackIcon,
  BlockIcon,
  ExitIcon,
  LockIcon,
  SearchIcon,
  TickIcon,
  UploadIcon,
  VideoIcon,
} from "@/views/chat/chat-icons.view";
import { ChatMessageBubble } from "@/views/chat/chat-message.view";

/** A message shown while the server is still saving it. */
export interface PendingChatMessage {
  readonly key: number;
  readonly body: string;
  readonly attachmentName: string | null;
  readonly createdAt: string;
}

interface ChatConversationProps {
  readonly summary: ChatSummary;
  readonly viewerId: string;
  readonly messages: readonly ChatMessage[];
  readonly pending: readonly PendingChatMessage[];
  readonly hasMore: boolean;
  readonly loadingOlder: boolean;
  readonly firstUnreadId: number | null;
  /** Who is typing, or null. */
  readonly typingName: string | null;
  /** Group members, for the header line; empty for direct chats. */
  readonly members: readonly ChatGroupMember[];
  /** Display name of a message's sender. */
  readonly nameFor: (userId: string) => string;
  readonly highlightedId: number | null;
  readonly now: number;
  readonly onLoadOlder: () => void;
  readonly onReply: (message: ChatMessage) => void;
  readonly onDelete: (message: ChatMessage) => void;
  readonly onReport: (message: ChatMessage) => void;
  readonly onJumpTo: (messageId: number) => void;
  /** Attachments already copied to, or being copied to, My Documents. */
  readonly savedIds: ReadonlySet<number>;
  readonly savingIds: ReadonlySet<number>;
  readonly onSaveToDocuments: (message: ChatMessage) => void;
  readonly onOpenProfile: () => void;
  readonly onOpenSearch: () => void;
  readonly sidePanelOpen: boolean;
  readonly onCloseSidePanel: () => void;
  readonly onUnblock: () => void;
  /** Removes a group the viewer no longer belongs to from their list. */
  readonly onDeleteChat: () => void;
  /** Starts a video call, or joins the one in progress when `start` is false. */
  readonly onCall: (start: boolean) => void;
  readonly callBusy: boolean;
  /** Files dragged from the device and dropped on the conversation. */
  readonly onDropFiles: (files: readonly File[]) => void;
  /** Shown only while sending is allowed. */
  readonly composer: ReactNode;
  /** Contact info and search panels that slide in over the conversation. */
  readonly sidePanels: ReactNode;
}

function statusLine(
  summary: ChatSummary,
  typingName: string | null,
  members: readonly ChatGroupMember[],
  viewerId: string,
  now: number,
): string {
  if (summary.group) {
    if (typingName && summary.canSend) {
      return `${typingName} is typing…`;
    }

    return summary.canSend
      ? groupMembersLine(members, viewerId) || `${summary.group.memberCount} members`
      : "Group";
  }

  const other = summary.other;

  if (typingName) {
    return "typing…";
  }

  if (!other || !summary.canSend) {
    return other?.academicLine ?? "";
  }

  const seen = presence(other.lastSeenAt, now);

  return [seen.label, other.academicLine].filter(Boolean).join(" · ");
}

const groupReadOnlyText = {
  left: "You left this group. You can still read messages from before you left.",
  removed: "You were removed from this group. You can still read messages from before.",
  disbanded: "This group was disbanded. Messages can no longer be sent.",
} as const;

/** Shown instead of the composer when sending is not allowed. */
function ReadOnlyFooter({
  summary,
  onUnblock,
  onDeleteChat,
}: {
  readonly summary: ChatSummary;
  readonly onUnblock: () => void;
  readonly onDeleteChat: () => void;
}) {
  const name = chatName(summary);
  const reason = readOnlyReason(summary);

  switch (reason) {
    case null:
      return null;
    case "blocked_by_me":
      return (
        <div className="chat-readonly">
          <BlockIcon />
          <span>You blocked {name}. Neither of you can send messages in this chat.</span>
          <button className="text-action" type="button" onClick={onUnblock}>
            Unblock
          </button>
        </div>
      );
    case "blocked_me":
      return (
        <div className="chat-readonly">
          <LockIcon />
          <span>You can no longer send messages in this chat.</span>
        </div>
      );
    case "not_buddies":
      return (
        <div className="chat-readonly">
          <LockIcon />
          <span>
            You are no longer study buddies with {name}, so you can read this chat but not send
            messages.
          </span>
          <Link href="/study-buddy">Find study buddies</Link>
        </div>
      );
    case "left":
    case "removed":
    case "disbanded":
      return (
        <div className="chat-readonly">
          <ExitIcon />
          <span>{groupReadOnlyText[reason]}</span>
          <button className="text-action" type="button" onClick={onDeleteChat}>
            Delete chat
          </button>
        </div>
      );
  }
}

export function ChatConversation({
  summary,
  viewerId,
  messages,
  pending,
  hasMore,
  loadingOlder,
  firstUnreadId,
  typingName,
  members,
  nameFor,
  highlightedId,
  now,
  onLoadOlder,
  onReply,
  onDelete,
  onReport,
  onJumpTo,
  savedIds,
  savingIds,
  onSaveToDocuments,
  onOpenProfile,
  onOpenSearch,
  sidePanelOpen,
  onCloseSidePanel,
  onUnblock,
  onDeleteChat,
  onCall,
  callBusy,
  onDropFiles,
  composer,
  sidePanels,
}: ChatConversationProps) {
  const name = chatName(summary);
  const isGroup = summary.group !== null;
  const typing = typingName !== null;
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const unreadCount =
    firstUnreadId === null
      ? 0
      : messages.filter(
          (message) =>
            message.id >= firstUnreadId &&
            message.senderId !== viewerId &&
            message.event === null &&
            message.deletedAt === null,
        ).length;

  const items: ReactNode[] = [];
  let previous: ChatMessage | null = null;

  for (const message of messages) {
    const newDay = !previous || !isSameChatDay(previous.createdAt, message.createdAt);

    if (newDay) {
      items.push(
        <li className="chat-day" key={`day-${message.id}`}>
          <span>{formatDayLabel(message.createdAt, now)}</span>
        </li>,
      );
    }

    if (message.id === firstUnreadId && unreadCount > 0) {
      items.push(
        <li className="chat-unread-divider" key="unread">
          <span>
            {unreadCount} unread message{unreadCount === 1 ? "" : "s"}
          </span>
        </li>,
      );
    }

    const mine = message.senderId === viewerId;

    if (message.event) {
      items.push(
        <li className="chat-event" key={message.id} id={`chat-message-${message.id}`}>
          <span>
            {chatEventText(message.event, {
              actorName: nameFor(message.senderId),
              targetName: message.eventUserId ? nameFor(message.eventUserId) : null,
              body: message.body,
              actorIsViewer: mine,
              targetIsViewer: message.eventUserId === viewerId,
            })}
            {message.event === "call_started" && summary.canSend ? (
              <button
                className="text-action chat-event-action"
                type="button"
                disabled={callBusy}
                onClick={() => onCall(false)}
              >
                Join
              </button>
            ) : null}
          </span>
        </li>,
      );
      previous = message;
      continue;
    }

    const startsGroup =
      newDay ||
      previous?.senderId !== message.senderId ||
      previous.event !== null ||
      message.id === firstUnreadId;
    const reply = message.replyTo;

    items.push(
      <ChatMessageBubble
        key={message.id}
        message={message}
        mine={mine}
        tick={mine ? tickStatus(message.createdAt, summary.otherReceipt) : null}
        startsGroup={startsGroup}
        highlighted={message.id === highlightedId}
        senderName={nameFor(message.senderId)}
        showSender={isGroup && !mine && startsGroup}
        replyName={reply ? (reply.senderId === viewerId ? "You" : nameFor(reply.senderId)) : null}
        canAct={summary.canSend}
        saveState={
          savedIds.has(message.id) ? "saved" : savingIds.has(message.id) ? "saving" : "idle"
        }
        onReply={onReply}
        onDelete={onDelete}
        onReport={onReport}
        onJumpTo={onJumpTo}
        onSaveToDocuments={onSaveToDocuments}
      />,
    );
    previous = message;
  }

  function hasFiles(event: DragEvent<HTMLElement>): boolean {
    return event.dataTransfer.types.includes("Files");
  }

  // Counting enter/leave pairs stops the overlay flickering over child elements.
  function dragEnter(event: DragEvent<HTMLElement>) {
    if (!summary.canSend || !hasFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function dragOver(event: DragEvent<HTMLElement>) {
    if (summary.canSend && hasFiles(event)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function dragLeave(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) {
      return;
    }

    dragDepth.current = Math.max(0, dragDepth.current - 1);

    if (dragDepth.current === 0) {
      setDragging(false);
    }
  }

  function drop(event: DragEvent<HTMLElement>) {
    if (!summary.canSend || !hasFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    onDropFiles([...event.dataTransfer.files]);
  }

  // Clicking anywhere in the chat room closes Contact info or Search, except
  // inside the panel itself and on the header buttons that toggle them.
  function closePanelOnOutsidePointer(event: PointerEvent<HTMLElement>) {
    const target = event.target as Element;

    if (sidePanelOpen && !target.closest(".chat-side-panel, [data-panel-toggle]")) {
      onCloseSidePanel();
    }
  }

  return (
    <section
      className={sidePanelOpen ? "chat-pane panel-open" : "chat-pane"}
      aria-label={isGroup ? `Group chat ${name}` : `Chat with ${name}`}
      onPointerDown={closePanelOnOutsidePointer}
      onDragEnter={dragEnter}
      onDragOver={dragOver}
      onDragLeave={dragLeave}
      onDrop={drop}
    >
      <header className="chat-pane-header">
        <Link className="chat-icon-button chat-back" href="/chats" aria-label="Back to chats">
          <BackIcon />
        </Link>
        <button
          className="chat-pane-contact"
          type="button"
          data-panel-toggle
          onClick={onOpenProfile}
          aria-label={isGroup ? `Group info for ${name}` : `Contact info for ${name}`}
        >
          <span className={isGroup ? "chat-avatar group" : "chat-avatar"} aria-hidden="true">
            {chatInitials(summary)}
          </span>
          <span className="chat-pane-identity">
            <span className="chat-pane-name">{name}</span>
            <span className={typing ? "chat-pane-status typing" : "chat-pane-status"}>
              {statusLine(summary, typingName, members, viewerId, now)}
            </span>
          </span>
        </button>
        {summary.canSend ? (
          <button
            className="chat-icon-button"
            type="button"
            onClick={() => onCall(true)}
            disabled={callBusy}
            aria-label={isGroup ? "Start or join a group video call" : "Start or join a video call"}
            title="Video call"
          >
            <VideoIcon />
          </button>
        ) : null}
        <button
          className="chat-icon-button"
          type="button"
          data-panel-toggle
          onClick={onOpenSearch}
          aria-label="Search messages"
          title="Search messages"
        >
          <SearchIcon />
        </button>
      </header>

      {dragging ? (
        <div className="chat-drop-overlay" aria-hidden="true">
          <UploadIcon />
          <strong>Drop a file to send to {name}</strong>
          <span>PDF, DOCX, PNG, JPG or WebP, up to 10 MB</span>
        </div>
      ) : null}

      <div className="chat-scroll">
        <ol className="chat-log" aria-label="Messages" aria-live="polite" aria-relevant="additions">
          {hasMore ? (
            <li className="chat-load-older">
              <button
                className="button button-outline"
                type="button"
                onClick={onLoadOlder}
                disabled={loadingOlder}
              >
                {loadingOlder ? "Loading..." : "Load earlier messages"}
              </button>
            </li>
          ) : (
            <li className="chat-notice">
              <span>
                <LockIcon />
                {isGroup
                  ? "Messages here are visible only to members of this group, from when they joined."
                  : messages.length === 0
                    ? `You and ${name} are study buddies. Messages here are visible only to the two of you.`
                    : `Messages here are visible only to you and ${name}.`}
              </span>
            </li>
          )}

          {items}

          {pending.map((message) => (
            <li className="chat-message mine pending" key={`pending-${message.key}`}>
              <div className="chat-bubble">
                {message.attachmentName ? (
                  <span className="chat-pending-file">Sending {message.attachmentName}…</span>
                ) : null}
                {message.body ? <span className="chat-text">{message.body}</span> : null}
                <span className="chat-meta">
                  <time dateTime={message.createdAt}>{formatChatTime(message.createdAt)}</time>
                  <TickIcon status="pending" />
                </span>
              </div>
            </li>
          ))}

          {typing ? (
            <li className="chat-message theirs starts-group" aria-label={`${typingName} is typing`}>
              <div className="chat-bubble chat-typing">
                <span />
                <span />
                <span />
              </div>
            </li>
          ) : null}
        </ol>
      </div>

      {summary.canSend ? composer : null}

      <ReadOnlyFooter summary={summary} onUnblock={onUnblock} onDeleteChat={onDeleteChat} />

      {sidePanels}
    </section>
  );
}
