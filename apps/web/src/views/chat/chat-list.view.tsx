"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  chatHref,
  chatInitials,
  chatName,
  formatListTime,
  isActiveGroupMember,
  lastMessagePreview,
  presence,
  tickStatus,
  type ChatContact,
  type ChatGroupInvite,
  type ChatSettingAction,
  type ChatSummary,
} from "@/models/chat/chat.model";
import {
  ChevronDownIcon,
  ComposeIcon,
  EraseIcon,
  ExitIcon,
  FileIcon,
  MuteIcon,
  PinIcon,
  SearchIcon,
  SoundIcon,
  TickIcon,
  TrashIcon,
} from "@/views/chat/chat-icons.view";
import { NewChatPanel } from "@/views/chat/new-chat-panel.view";
import { NewGroupPanel } from "@/views/chat/new-group-panel.view";
import { Avatar } from "@/views/shared/avatar.view";

type ChatFilter = "all" | "unread";

interface ChatListProps {
  readonly viewerId: string;
  readonly conversations: readonly ChatSummary[];
  readonly invites: readonly ChatGroupInvite[];
  readonly activeId: number | null;
  readonly contacts: readonly ChatContact[];
  readonly now: number;
  readonly onAction: (chat: ChatSummary, action: ChatSettingAction) => void;
  readonly onLeaveGroup: (chat: ChatSummary) => void;
  readonly onRespondInvite: (invite: ChatGroupInvite, accept: boolean) => Promise<void>;
  /** Resolves to an error message, or null once the group exists. */
  readonly onCreateGroup: (title: string, memberIds: string[]) => Promise<string | null>;
}

/** Group invitations waiting for an answer, above the chat list. */
function GroupInvites({
  invites,
  onRespond,
}: {
  readonly invites: readonly ChatGroupInvite[];
  readonly onRespond: (invite: ChatGroupInvite, accept: boolean) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);

  async function respond(invite: ChatGroupInvite, accept: boolean) {
    setBusyId(invite.id);

    try {
      await onRespond(invite, accept);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="chat-invites" aria-label="Group invitations">
      <p className="chat-new-panel-section">Group invitations</p>
      <ul>
        {invites.map((invite) => (
          <li className="chat-invite" key={invite.id}>
            <span className="chat-avatar group" aria-hidden="true">{invite.initials}</span>
            <span className="chat-contact-text">
              <strong>{invite.title}</strong>
              <small>
                {invite.inviterName} invited you · {invite.memberCount} member
                {invite.memberCount === 1 ? "" : "s"}
              </small>
            </span>
            <span className="chat-invite-actions">
              <button
                className="button button-outline"
                type="button"
                disabled={busyId !== null}
                onClick={() => void respond(invite, false)}
              >
                Decline
              </button>
              <button
                className="button button-dark"
                type="button"
                disabled={busyId !== null}
                onClick={() => void respond(invite, true)}
              >
                {busyId === invite.id ? "Joining..." : "Join"}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The ▾ button on a chat row: pin, mute, clear, delete or exit that chat. */
function ChatRowMenu({
  chat,
  onAction,
  onLeaveGroup,
}: {
  readonly chat: ChatSummary;
  readonly onAction: (chat: ChatSummary, action: ChatSettingAction) => void;
  readonly onLeaveGroup: (chat: ChatSummary) => void;
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
        aria-label={`Options for ${chat.group ? "group" : "chat with"} ${chatName(chat)}`}
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
          {isActiveGroupMember(chat) ? (
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setOpen(false);
                onLeaveGroup(chat);
              }}
            >
              <ExitIcon />
              Exit group
            </button>
          ) : (
            <button type="button" role="menuitem" className="danger" onClick={() => choose("delete")}>
              <TrashIcon />
              Delete chat
            </button>
          )}
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
  onLeaveGroup,
}: {
  readonly chat: ChatSummary;
  readonly viewerId: string;
  readonly active: boolean;
  readonly now: number;
  readonly onAction: (chat: ChatSummary, action: ChatSettingAction) => void;
  readonly onLeaveGroup: (chat: ChatSummary) => void;
}) {
  const last = chat.lastMessage;
  const isGroup = chat.group !== null;
  const mine = last !== null && last.senderId === viewerId && !last.deleted && last.event === null;
  const online = chat.canSend && chat.other !== null && presence(chat.other.lastSeenAt, now).online;
  const unread = active ? 0 : chat.unreadCount;
  const showFileIcon =
    last !== null && !last.deleted && last.event === null && !last.body.trim() && last.attachmentName;

  return (
    <li className="chat-row-item">
      <Link
        className={active ? "chat-row active" : "chat-row"}
        href={chatHref(chat.id)}
        aria-current={active ? "page" : undefined}
      >
        <span className="chat-avatar-wrap">
          <Avatar
            className={isGroup ? "chat-avatar group" : "chat-avatar"}
            initials={chatInitials(chat)}
            url={chat.other?.avatarUrl}
          />
          {online ? <span className="chat-online-dot" aria-label="Online" /> : null}
        </span>
        <span className="chat-row-text">
          <span className="chat-row-top">
            <strong>{chatName(chat)}</strong>
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
              <span>{lastMessagePreview(last, viewerId, chat.clearedAt !== null, isGroup)}</span>
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
      <ChatRowMenu chat={chat} onAction={onAction} onLeaveGroup={onLeaveGroup} />
    </li>
  );
}

export function ChatList({
  viewerId,
  conversations,
  invites,
  activeId,
  contacts,
  now,
  onAction,
  onLeaveGroup,
  onRespondInvite,
  onCreateGroup,
}: ChatListProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const newChatButtonRef = useRef<HTMLButtonElement>(null);
  const search = query.trim().toLowerCase();
  const unreadChats = conversations.filter(
    (chat) => chat.id !== activeId && chat.unreadCount > 0,
  ).length;
  const visible = conversations.filter(
    (chat) =>
      (filter === "all" || chat.unreadCount > 0 || chat.id === activeId) &&
      (!search ||
        chatName(chat).toLowerCase().includes(search) ||
        chat.other?.username?.toLowerCase().includes(search)),
  );

  return (
    <aside className="chat-sidebar" aria-label="Chats">
      <div className="chat-sidebar-main" inert={newChatOpen || newGroupOpen}>
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
            placeholder="Search chats"
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

        {invites.length > 0 && !search ? (
          <GroupInvites invites={invites} onRespond={onRespondInvite} />
        ) : null}

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
                onLeaveGroup={onLeaveGroup}
              />
            ))}
          </ul>
        ) : invites.length > 0 && !search ? null : (
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
        onNewGroup={() => {
          setNewChatOpen(false);
          setNewGroupOpen(true);
        }}
      />

      <NewGroupPanel
        open={newGroupOpen}
        contacts={contacts}
        onClose={() => {
          setNewGroupOpen(false);
          newChatButtonRef.current?.focus();
        }}
        onCreate={async (title, memberIds) => {
          const error = await onCreateGroup(title, memberIds);

          if (!error) {
            setNewGroupOpen(false);
          }

          return error;
        }}
      />
    </aside>
  );
}
