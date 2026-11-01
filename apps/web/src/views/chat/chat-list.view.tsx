"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  chatHref,
  formatListTime,
  lastMessagePreview,
  presence,
  tickStatus,
  type ChatContact,
  type ChatSettingAction,
  type ChatSummary,
} from "@/models/chat/chat.model";
import {
  ChevronDownIcon,
  ComposeIcon,
  EraseIcon,
  FileIcon,
  MuteIcon,
  PinIcon,
  SearchIcon,
  SoundIcon,
  TickIcon,
  TrashIcon,
} from "@/views/chat/chat-icons.view";
import { NewChatPanel } from "@/views/chat/new-chat-panel.view";

type ChatFilter = "all" | "unread";

interface ChatListProps {
  readonly viewerId: string;
  readonly conversations: readonly ChatSummary[];
  readonly activeId: number | null;
  readonly contacts: readonly ChatContact[];
  readonly now: number;
  readonly onAction: (chat: ChatSummary, action: ChatSettingAction) => void;
}

/** The ▾ button on a chat row: pin, mute, clear or delete that chat. */
function ChatRowMenu({
  chat,
  onAction,
}: {
  readonly chat: ChatSummary;
  readonly onAction: (chat: ChatSummary, action: ChatSettingAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = `chat-row-menu-${chat.id}`;

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function choose(action: ChatSettingAction) {
    setOpen(false);
    onAction(chat, action);
  }

  return (
    <div className={open ? "chat-row-menu open" : "chat-row-menu"} ref={rootRef}>
      <button
        className="chat-row-menu-button"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Options for chat with ${chat.other.fullName}`}
      >
        <ChevronDownIcon />
      </button>

      {open ? (
        <div className="chat-menu" id={menuId} role="menu">
          <button type="button" role="menuitem" onClick={() => choose(chat.pinnedAt ? "unpin" : "pin")}>
            <PinIcon />
            {chat.pinnedAt ? "Unpin chat" : "Pin chat"}
          </button>
          <button type="button" role="menuitem" onClick={() => choose(chat.muted ? "unmute" : "mute")}>
            {chat.muted ? <SoundIcon /> : <MuteIcon />}
            {chat.muted ? "Unmute notifications" : "Mute notifications"}
          </button>
          <button type="button" role="menuitem" onClick={() => choose("clear")}>
            <EraseIcon />
            Clear chat
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => choose("delete")}>
            <TrashIcon />
            Delete chat
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ChatRow({
  chat,
  viewerId,
  active,
  now,
  onAction,
}: {
  readonly chat: ChatSummary;
  readonly viewerId: string;
  readonly active: boolean;
  readonly now: number;
  readonly onAction: (chat: ChatSummary, action: ChatSettingAction) => void;
}) {
  const last = chat.lastMessage;
  const mine = last !== null && last.senderId === viewerId && !last.deleted;
  const online = chat.canSend && presence(chat.other.lastSeenAt, now).online;
  const unread = active ? 0 : chat.unreadCount;
  const showFileIcon = last !== null && !last.deleted && !last.body.trim() && last.attachmentName;

  return (
    <li className="chat-row-item">
      <Link
        className={active ? "chat-row active" : "chat-row"}
        href={chatHref(chat.id)}
        aria-current={active ? "page" : undefined}
      >
        <span className="chat-avatar-wrap">
          <span className="chat-avatar" aria-hidden="true">{chat.other.initials}</span>
          {online ? <span className="chat-online-dot" aria-label="Online" /> : null}
        </span>
        <span className="chat-row-text">
          <span className="chat-row-top">
            <strong>{chat.other.fullName}</strong>
            {last ? (
              <time className={unread > 0 ? "unread" : undefined} dateTime={last.createdAt}>
                {formatListTime(last.createdAt, now)}
              </time>
            ) : null}
          </span>
          <span className="chat-row-bottom">
            <span className={last?.deleted ? "chat-row-preview deleted" : "chat-row-preview"}>
              {mine ? <TickIcon status={tickStatus(last.createdAt, chat.otherReceipt)} /> : null}
              {showFileIcon ? <FileIcon /> : null}
              <span>{lastMessagePreview(last, viewerId, chat.clearedAt !== null)}</span>
            </span>
            <span className="chat-row-badges">
              {chat.muted ? (
                <span className="chat-row-flag" title="Muted">
                  <MuteIcon size={16} />
                  <span className="visually-hidden">Muted</span>
                </span>
              ) : null}
              {chat.pinnedAt ? (
                <span className="chat-row-flag" title="Pinned">
                  <PinIcon size={16} />
                  <span className="visually-hidden">Pinned</span>
                </span>
              ) : null}
              {unread > 0 ? (
                <span className={chat.muted ? "chat-unread-count muted" : "chat-unread-count"}>
                  <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
                  <span className="visually-hidden">{unread} unread</span>
                </span>
              ) : null}
            </span>
          </span>
        </span>
      </Link>
      <ChatRowMenu chat={chat} onAction={onAction} />
    </li>
  );
}

export function ChatList({
  viewerId,
  conversations,
  activeId,
  contacts,
  now,
  onAction,
}: ChatListProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const newChatButtonRef = useRef<HTMLButtonElement>(null);
  const search = query.trim().toLowerCase();
  const unreadChats = conversations.filter(
    (chat) => chat.id !== activeId && chat.unreadCount > 0,
  ).length;
  const visible = conversations.filter(
    (chat) =>
      (filter === "all" || chat.unreadCount > 0 || chat.id === activeId) &&
      (!search ||
        chat.other.fullName.toLowerCase().includes(search) ||
        chat.other.username?.toLowerCase().includes(search)),
  );

  return (
    <aside className="chat-sidebar" aria-label="Chats">
      <div className="chat-sidebar-main" inert={newChatOpen}>
        <header className="chat-sidebar-header">
          <h1>Chats</h1>
          <button
            ref={newChatButtonRef}
            className="chat-icon-button"
            type="button"
            onClick={() => setNewChatOpen(true)}
            aria-expanded={newChatOpen}
            aria-label="New chat with a study buddy"
            title="New chat"
          >
            <ComposeIcon />
          </button>
        </header>

        <label className="chat-search">
          <SearchIcon />
          <span className="visually-hidden">Search chats</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search buddies"
            autoComplete="off"
          />
        </label>

        <div className="chat-filters" role="group" aria-label="Filter chats">
          <button
            className={filter === "all" ? "chat-filter active" : "chat-filter"}
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={filter === "unread" ? "chat-filter active" : "chat-filter"}
            type="button"
            aria-pressed={filter === "unread"}
            onClick={() => setFilter("unread")}
          >
            Unread{unreadChats > 0 ? ` · ${unreadChats}` : ""}
          </button>
        </div>

        {visible.length > 0 ? (
          <ul className="chat-rows">
            {visible.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                viewerId={viewerId}
                active={chat.id === activeId}
                now={now}
                onAction={onAction}
              />
            ))}
          </ul>
        ) : (
          <div className="chat-sidebar-empty">
            {conversations.length === 0 ? (
              contacts.length > 0 ? (
                <p>No chats yet. Use the pencil button to message a study buddy.</p>
              ) : (
                <p>
                  No chats yet. Once a classmate accepts your study buddy request, you can
                  message them here. <Link href="/study-buddy">Find study buddies</Link>
                </p>
              )
            ) : (
              <p>{search ? `No chats match “${query.trim()}”.` : "No unread chats."}</p>
            )}
          </div>
        )}
      </div>

      <NewChatPanel
        open={newChatOpen}
        contacts={contacts}
        onClose={() => {
          setNewChatOpen(false);
          newChatButtonRef.current?.focus();
        }}
      />
    </aside>
  );
}
