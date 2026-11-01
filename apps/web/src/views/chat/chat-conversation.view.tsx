"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from "react";

import {
  formatChatTime,
  formatDayLabel,
  isSameChatDay,
  presence,
  readOnlyReason,
  tickStatus,
  type ChatMessage,
  type ChatSummary,
} from "@/models/chat/chat.model";
import {
  BackIcon,
  BlockIcon,
  LockIcon,
  SearchIcon,
  TickIcon,
  UploadIcon,
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
  readonly typing: boolean;
  readonly highlightedId: number | null;
  readonly now: number;
  readonly onLoadOlder: () => void;
  readonly onReply: (message: ChatMessage) => void;
  readonly onDelete: (message: ChatMessage) => void;
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
  /** Files dragged from the device and dropped on the conversation. */
  readonly onDropFiles: (files: readonly File[]) => void;
  /** Shown only while sending is allowed. */
  readonly composer: ReactNode;
  /** Contact info and search panels that slide in over the conversation. */
  readonly sidePanels: ReactNode;
}

function statusLine(summary: ChatSummary, typing: boolean, now: number): string {
  if (typing) {
    return "typing…";
  }

  if (!summary.canSend) {
    return summary.other.academicLine ?? "";
  }

  const seen = presence(summary.other.lastSeenAt, now);

  return [seen.label, summary.other.academicLine].filter(Boolean).join(" · ");
}

export function ChatConversation({
  summary,
  viewerId,
  messages,
  pending,
  hasMore,
  loadingOlder,
  firstUnreadId,
  typing,
  highlightedId,
  now,
  onLoadOlder,
  onReply,
  onDelete,
  onJumpTo,
  savedIds,
  savingIds,
  onSaveToDocuments,
  onOpenProfile,
  onOpenSearch,
  sidePanelOpen,
  onCloseSidePanel,
  onUnblock,
  onDropFiles,
  composer,
  sidePanels,
}: ChatConversationProps) {
  const other = summary.other;
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const unreadCount =
    firstUnreadId === null
      ? 0
      : messages.filter(
          (message) =>
            message.id >= firstUnreadId &&
            message.senderId === other.id &&
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

    items.push(
      <ChatMessageBubble
        key={message.id}
        message={message}
        mine={mine}
        tick={mine ? tickStatus(message.createdAt, summary.otherReceipt) : null}
        startsGroup={newDay || previous?.senderId !== message.senderId || message.id === firstUnreadId}
        highlighted={message.id === highlightedId}
        viewerId={viewerId}
        otherName={other.fullName}
        canAct={summary.canSend}
        saveState={
          savedIds.has(message.id) ? "saved" : savingIds.has(message.id) ? "saving" : "idle"
        }
        onReply={onReply}
        onDelete={onDelete}
        onJumpTo={onJumpTo}
        onSaveToDocuments={onSaveToDocuments}
      />,
    );
    previous = message;
  }

  const reason = readOnlyReason(summary);

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
      aria-label={`Chat with ${other.fullName}`}
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
          aria-label={`Contact info for ${other.fullName}`}
        >
          <span className="chat-avatar" aria-hidden="true">{other.initials}</span>
          <span className="chat-pane-identity">
            <span className="chat-pane-name">{other.fullName}</span>
            <span className={typing ? "chat-pane-status typing" : "chat-pane-status"}>
              {statusLine(summary, typing, now)}
            </span>
          </span>
        </button>
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
          <strong>Drop a file to send to {other.fullName}</strong>
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
                {messages.length === 0
                  ? `You and ${other.fullName} are study buddies. Messages here are visible only to the two of you.`
                  : `Messages here are visible only to you and ${other.fullName}.`}
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
            <li className="chat-message theirs starts-group" aria-label={`${other.fullName} is typing`}>
              <div className="chat-bubble chat-typing">
                <span />
                <span />
                <span />
              </div>
            </li>
          ) : null}
        </ol>
      </div>

      {reason === null ? composer : null}

      {reason === "blocked_by_me" ? (
        <div className="chat-readonly">
          <BlockIcon />
          <span>You blocked {other.fullName}. Neither of you can send messages in this chat.</span>
          <button className="text-action" type="button" onClick={onUnblock}>
            Unblock
          </button>
        </div>
      ) : null}

      {reason === "blocked_me" ? (
        <div className="chat-readonly">
          <LockIcon />
          <span>You can no longer send messages in this chat.</span>
        </div>
      ) : null}

      {reason === "not_buddies" ? (
        <div className="chat-readonly">
          <LockIcon />
          <span>
            You are no longer study buddies with {other.fullName}, so you can read this chat but
            not send messages.
          </span>
          <Link href="/study-buddy">Find study buddies</Link>
        </div>
      ) : null}

      {sidePanels}
    </section>
  );
}
