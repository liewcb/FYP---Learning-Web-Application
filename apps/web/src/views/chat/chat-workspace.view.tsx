"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ChatRealtime,
  ChatTypingChannel,
} from "@/interfaces/services/chat-realtime.interface";
import {
  chatHref,
  chatName,
  chatRules,
  chatsChangedEvent,
  compareChats,
  memberNames,
  normaliseChatBody,
  type ChatActionState,
  type ChatDeleteState,
  type ChatGroupCommand,
  type ChatGroupCreateState,
  type ChatGroupInvite,
  type ChatGroupMember,
  type ChatInviteResponseState,
  type ChatLastMessage,
  type ChatListRefresh,
  type ChatMessage,
  type ChatOlderMessages,
  type ChatPageModel,
  type ChatProfileDetails,
  type ChatReportReason,
  type ChatReportState,
  type ChatSaveState,
  type ChatSearchResult,
  type ChatSendState,
  type ChatSettingAction,
  type ChatSummary,
  type ChatSyncResult,
} from "@/models/chat/chat.model";
import { videoCallHref, type VideoCallOpenState } from "@/models/video/video-call.model";
import type { AttachmentSaveState } from "@/views/chat/chat-attachment.view";
import {
  ChatComposer,
  type ChatComposerHandle,
  type ChatDraft,
} from "@/views/chat/chat-composer.view";
import {
  ChatConfirmDialog,
  type ChatConfirmRequest,
} from "@/views/chat/chat-confirm-dialog.view";
import {
  ChatConversation,
  type PendingChatMessage,
} from "@/views/chat/chat-conversation.view";
import { ChatGroupPanel } from "@/views/chat/chat-group-panel.view";
import { ChatBubbleIcon, CloseIcon } from "@/views/chat/chat-icons.view";
import { ChatList } from "@/views/chat/chat-list.view";
import { ChatProfilePanel } from "@/views/chat/chat-profile-panel.view";
import { ChatReportDialog } from "@/views/chat/chat-report-dialog.view";
import { ChatSearchPanel } from "@/views/chat/chat-search-panel.view";

/** Server Actions the workspace calls; supplied by the route. */
export interface ChatActions {
  send(formData: FormData): Promise<ChatSendState>;
  remove(messageId: number): Promise<ChatDeleteState>;
  sync(conversationId: number, afterId: number, markRead: boolean): Promise<ChatSyncResult | null>;
  loadOlder(conversationId: number, beforeId: number): Promise<ChatOlderMessages | null>;
  loadFrom(conversationId: number, messageId: number): Promise<ChatOlderMessages | null>;
  refreshList(): Promise<ChatListRefresh | null>;
  saveToDocuments(messageId: number): Promise<ChatSaveState>;
  applySetting(conversationId: number, action: ChatSettingAction): Promise<ChatActionState>;
  report(
    conversationId: number,
    reason: ChatReportReason,
    details: string,
    block: boolean,
  ): Promise<ChatReportState>;
  loadDetails(conversationId: number): Promise<ChatProfileDetails | null>;
  search(conversationId: number, query: string): Promise<ChatSearchResult[] | null>;
  createGroup(title: string, memberIds: string[]): Promise<ChatGroupCreateState>;
  respondToInvite(inviteId: number, accept: boolean): Promise<ChatInviteResponseState>;
  groupCommand(groupId: number, command: ChatGroupCommand): Promise<ChatActionState>;
  loadMembers(groupId: number): Promise<ChatGroupMember[] | null>;
  openCall(conversationId: number, start: boolean): Promise<VideoCallOpenState>;
}

type SidePanel = "profile" | "search" | null;

type ConfirmCopy = Omit<ChatConfirmRequest, "onConfirm">;

/** Confirmation copy for the actions that change or hide history. */
function confirmCopy(chat: ChatSummary, action: ChatSettingAction): ConfirmCopy | null {
  const name = chatName(chat);

  switch (action) {
    case "clear":
      return {
        title: "Clear this chat?",
        body: chat.group
          ? `Messages in ${name} will be removed for you only. Other members will still see them.`
          : `Messages with ${name} will be removed for you only. ${name} will still see them.`,
        confirmLabel: "Clear chat",
        danger: true,
      };
    case "delete":
      return {
        title: "Delete this chat?",
        body: chat.group
          ? `${name} and its messages will be removed for you only.`
          : `The chat with ${name} and its messages will be removed for you only. It comes back if ${name} sends a new message.`,
        confirmLabel: "Delete chat",
        danger: true,
      };
    case "block":
      return {
        title: `Block ${name}?`,
        body: `Neither of you will be able to send messages in this chat, and ${name} will no longer see when you are online. You can unblock at any time.`,
        confirmLabel: "Block",
        danger: true,
      };
    default:
      return null;
  }
}

/** Confirmation copy for group changes that cannot simply be undone. */
function groupConfirmCopy(
  chat: ChatSummary,
  command: ChatGroupCommand,
  memberName: (userId: string) => string,
): ConfirmCopy | null {
  const name = chatName(chat);

  switch (command.type) {
    case "remove":
      return {
        title: `Remove ${memberName(command.studentId)}?`,
        body: `${memberName(command.studentId)} will no longer see new messages in ${name}. You can invite them again later.`,
        confirmLabel: "Remove",
        danger: true,
      };
    case "make_admin":
      return {
        title: `Make ${memberName(command.studentId)} the group admin?`,
        body: "There is one admin per group, so you will become a regular member.",
        confirmLabel: "Make admin",
      };
    case "leave":
      return {
        title: `Exit ${name}?`,
        body:
          chat.group?.memberCount === 1
            ? "You are the last member, so the group will be disbanded."
            : "You will stop receiving new messages. If you are the admin, the member who joined earliest takes over.",
        confirmLabel: "Exit group",
        danger: true,
      };
    case "disband":
      return {
        title: `Disband ${name}?`,
        body: "Nobody will be able to send messages any more. Members can still read the history.",
        confirmLabel: "Disband group",
        danger: true,
      };
    default:
      return null;
  }
}

const scrollSettleFallbackMs = 700;
/** Matches the chat-highlight animations in globals.css. */
const highlightDurationMs = 2200;
/** Matches the .chat-pane container query: wider chats keep the panel beside them. */
const sidePanelBesideMinWidth = 760;

/** Calls `done` once a smooth scroll of `container` has finished. */
function afterScroll(container: HTMLElement, done: () => void) {
  let finished = false;
  const finish = () => {
    if (!finished) {
      finished = true;
      container.removeEventListener("scrollend", finish);
      done();
    }
  };

  container.addEventListener("scrollend", finish, { once: true });
  // Browsers without scrollend, or no scroll needed after all.
  window.setTimeout(finish, scrollSettleFallbackMs);
}

/**
 * Waits a few frames for a message to render, scrolls it to the middle of
 * the chat, then highlights it once it is in view, like WhatsApp.
 */
function scrollToMessage(messageId: number, highlight: (id: number) => void, attempts = 30) {
  const element = document.getElementById(`chat-message-${messageId}`);

  if (!element) {
    if (attempts > 0) {
      window.requestAnimationFrame(() => scrollToMessage(messageId, highlight, attempts - 1));
    }
    return;
  }

  const container = element.closest<HTMLElement>(".chat-scroll");

  if (!container) {
    element.scrollIntoView({ block: "center" });
    highlight(messageId);
    return;
  }

  const view = container.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  const alreadyVisible = box.top >= view.top + 24 && box.bottom <= view.bottom - 24;

  if (alreadyVisible) {
    highlight(messageId);
    return;
  }

  afterScroll(container, () => highlight(messageId));
  element.scrollIntoView({ behavior: "smooth", block: "center" });
}

interface ChatNotice {
  readonly text: string;
  readonly link?: { readonly href: string; readonly label: string };
}

interface ChatWorkspaceProps {
  readonly model: ChatPageModel;
  readonly actions: ChatActions;
  readonly realtime: ChatRealtime;
}

const sendFailed = "Your message could not be sent. Please try again.";

function mergeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));

  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort((a, b) => a.id - b.id);
}

function sortChats(list: readonly ChatSummary[]): ChatSummary[] {
  return [...list].sort(compareChats);
}

function upsertChat(list: readonly ChatSummary[], chat: ChatSummary): ChatSummary[] {
  return sortChats([...list.filter((item) => item.id !== chat.id), chat]);
}

function toLastMessage(message: ChatMessage, senderName: string): ChatLastMessage {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName,
    body: message.body,
    attachmentName: message.attachment?.name ?? null,
    deleted: message.deletedAt !== null,
    event: message.event,
    eventUserId: message.eventUserId,
    eventUserName: null,
    createdAt: message.createdAt,
  };
}

function deletedLastMessage(message: ChatLastMessage): ChatLastMessage {
  return { ...message, body: "", attachmentName: null, deleted: true };
}

/** Tells the Chats badge in the top bar to refresh. */
function notifyChatsChanged() {
  window.dispatchEvent(new Event(chatsChangedEvent));
}

export function ChatWorkspace({ model, actions, realtime }: ChatWorkspaceProps) {
  const { viewerId, active } = model;
  const activeId = active?.summary.id ?? null;
  const activeIsGroup = active?.summary.group != null;
  // Direct chats only show the other student typing; groups any current member.
  const otherId = active?.summary.other?.id ?? null;

  const [conversations, setConversations] = useState<readonly ChatSummary[]>(
    model.conversations,
  );
  const [invites, setInvites] = useState<readonly ChatGroupInvite[]>(model.invites);
  const [summary, setSummary] = useState<ChatSummary | null>(active?.summary ?? null);
  const [members, setMembers] = useState<readonly ChatGroupMember[]>(active?.members ?? []);
  const [messages, setMessages] = useState<readonly ChatMessage[]>(active?.messages ?? []);
  const [hasMore, setHasMore] = useState(active?.hasMore ?? false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<readonly PendingChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [notice, setNotice] = useState<ChatNotice | null>(
    model.notice ? { text: model.notice } : null,
  );
  const [savingIds, setSavingIds] = useState<ReadonlySet<number>>(new Set());
  const [savedIds, setSavedIds] = useState<ReadonlySet<number>>(new Set());
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [details, setDetails] = useState<ChatProfileDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [confirm, setConfirm] = useState<ChatConfirmRequest | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  // Starts from the server's clock so the first render matches hydration.
  const [now, setNow] = useState(() => Date.parse(model.generatedAt));
  const router = useRouter();
  const composerRef = useRef<ChatComposerHandle>(null);

  const messagesRef = useRef<readonly ChatMessage[]>(messages);
  const conversationsRef = useRef<readonly ChatSummary[]>(conversations);
  const membersRef = useRef<readonly ChatGroupMember[]>(members);
  const typingChannelRef = useRef<ChatTypingChannel | null>(null);
  const lastTypingSentRef = useRef(0);
  const pendingKeyRef = useRef(0);
  const syncingRef = useRef(false);
  const syncAgainRef = useRef(false);
  const highlightTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const names = useMemo(() => memberNames(members), [members]);
  const otherName = summary?.other?.fullName ?? null;

  /** Display name of a message's sender in the open chat. */
  const nameFor = useCallback(
    (userId: string) => {
      if (userId === otherId && otherName) {
        return otherName;
      }

      return names.get(userId) ?? "Former member";
    },
    [names, otherId, otherName],
  );

  // Opening a chat marks it read on the server, so the badge can drop.
  useEffect(() => {
    notifyChatsChanged();
  }, []);

  // A file dropped outside the conversation would make the browser open it
  // and leave the chat, so ignore drops anywhere else on the page.
  useEffect(() => {
    function ignoreFileDrop(event: DragEvent) {
      if (event.dataTransfer?.types.includes("Files")) {
        event.preventDefault();
      }
    }

    window.addEventListener("dragover", ignoreFileDrop);
    window.addEventListener("drop", ignoreFileDrop);

    return () => {
      window.removeEventListener("dragover", ignoreFileDrop);
      window.removeEventListener("drop", ignoreFileDrop);
    };
  }, []);

  /** Fetches new messages and receipts for the open chat. */
  const syncActive = useCallback(async () => {
    if (activeId === null) {
      return;
    }

    // One request at a time; changes that arrive meanwhile trigger one more.
    if (syncingRef.current) {
      syncAgainRef.current = true;
      return;
    }

    syncingRef.current = true;

    try {
      do {
        syncAgainRef.current = false;
        const lastId = messagesRef.current.reduce((max, message) => Math.max(max, message.id), 0);
        const result = await actions.sync(
          activeId,
          lastId,
          document.visibilityState === "visible",
        );

        if (!result) {
          break;
        }

        setSummary(result.summary);
        setNow(Date.now());

        if (result.summary.lastMessage) {
          setConversations((list) => upsertChat(list, { ...result.summary, unreadCount: 0 }));
        }

        if (result.messages.length > 0) {
          messagesRef.current = mergeMessages(messagesRef.current, result.messages);
          setMessages((current) => mergeMessages(current, result.messages));

          // Whoever was typing has sent their message.
          const senders = new Set(result.messages.map((message) => message.senderId));
          setTypingUserId((current) => (current && senders.has(current) ? null : current));
        }
      } while (syncAgainRef.current);
    } finally {
      syncingRef.current = false;
    }

    notifyChatsChanged();
  }, [actions, activeId]);

  /** Reloads the open group's members after a membership event. */
  const reloadMembers = useCallback(async () => {
    if (activeId === null || !activeIsGroup) {
      return;
    }

    const list = await actions.loadMembers(activeId);

    if (list) {
      setMembers(list);
    }
  }, [actions, activeId, activeIsGroup]);

  const refreshList = useCallback(async () => {
    const result = await actions.refreshList();

    if (!result) {
      return;
    }

    const list = result.conversations;

    setNow(Date.now());
    setInvites(result.invites);
    setConversations((current) => {
      const fresh = list.map((chat) => (chat.id === activeId ? { ...chat, unreadCount: 0 } : chat));
      const openChat = current.find((chat) => chat.id === activeId);

      // Keep a just-opened, still empty chat in the list.
      return openChat && !fresh.some((chat) => chat.id === activeId)
        ? sortChats([...fresh, openChat])
        : fresh;
    });
  }, [actions, activeId]);

  useEffect(() => {
    return realtime.watchInbox({
      onMessageInserted(event) {
        // Membership events change the group itself (name, admin, members).
        if (event.event !== null) {
          if (event.conversationId === activeId) {
            void syncActive();
            void reloadMembers();
          }

          void refreshList();
          return;
        }

        if (event.conversationId === activeId) {
          void syncActive();
          return;
        }

        notifyChatsChanged();

        const known = conversationsRef.current.find((chat) => chat.id === event.conversationId);

        if (!known) {
          void refreshList();
          return;
        }

        setConversations((list) =>
          sortChats(
            list.map((chat) =>
              chat.id === event.conversationId
                ? {
                    ...chat,
                    lastMessage: {
                      id: event.id,
                      senderId: event.senderId,
                      // An unknown group sender's name arrives with the next list
                      // refresh; fetching it now would cost a query per message.
                      senderName:
                        chat.lastMessage?.senderId === event.senderId
                          ? chat.lastMessage.senderName
                          : (chat.other?.fullName ?? ""),
                      body: event.body,
                      attachmentName: event.attachmentName,
                      deleted: event.deletedAt !== null,
                      event: null,
                      eventUserId: null,
                      eventUserName: null,
                      createdAt: event.createdAt,
                    },
                    unreadCount:
                      event.senderId === viewerId ? chat.unreadCount : chat.unreadCount + 1,
                  }
                : chat,
            ),
          ),
        );
      },

      onMessageUpdated(event) {
        const deletedAt = event.deletedAt;

        if (deletedAt === null) {
          return;
        }

        if (event.conversationId === activeId) {
          setMessages((current) =>
            current.map((message) => {
              if (message.id === event.id) {
                return { ...message, body: "", attachment: null, deletedAt };
              }

              return message.replyTo?.id === event.id
                ? {
                    ...message,
                    replyTo: { ...message.replyTo, body: "", attachmentName: null, deleted: true },
                  }
                : message;
            }),
          );
        }

        setConversations((list) =>
          list.map((chat) =>
            chat.lastMessage?.id === event.id
              ? { ...chat, lastMessage: deletedLastMessage(chat.lastMessage) }
              : chat,
          ),
        );
      },

      onReceipt(event) {
        if (event.userId === viewerId) {
          // Read in another tab or window.
          const readAt = event.lastReadAt ? Date.parse(event.lastReadAt) : 0;

          setConversations((list) =>
            list.map((chat) =>
              chat.id === event.conversationId &&
              chat.lastMessage &&
              readAt >= Date.parse(chat.lastMessage.createdAt)
                ? { ...chat, unreadCount: 0 }
                : chat,
            ),
          );
          notifyChatsChanged();
          return;
        }

        const receipt = {
          lastDeliveredAt: event.lastDeliveredAt,
          lastReadAt: event.lastReadAt,
        };

        if (event.conversationId === activeId) {
          setSummary((current) => current && { ...current, otherReceipt: receipt });
        }

        setConversations((list) =>
          list.map((chat) =>
            chat.id === event.conversationId ? { ...chat, otherReceipt: receipt } : chat,
          ),
        );
      },

      onReconnected() {
        void syncActive();
        void refreshList();
      },
    });
  }, [realtime, activeId, viewerId, syncActive, refreshList, reloadMembers]);

  useEffect(() => {
    if (activeId === null || (otherId === null && !activeIsGroup)) {
      return;
    }

    let hideTimer: number | undefined;
    const channel = realtime.joinConversation(activeId, (userId) => {
      const allowed = activeIsGroup
        ? userId !== viewerId &&
          membersRef.current.some((member) => member.id === userId && member.status === "member")
        : userId === otherId;

      if (!allowed) {
        return;
      }

      setTypingUserId(userId);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setTypingUserId(null), chatRules.typingVisibleMs);
    });

    typingChannelRef.current = channel;

    return () => {
      window.clearTimeout(hideTimer);
      channel.leave();
      typingChannelRef.current = null;
    };
  }, [realtime, activeId, activeIsGroup, otherId, viewerId]);

  // Safety net for missed events, and keeps "online" / "last seen" current.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void refreshList();
      void syncActive();
    }, chatRules.refreshIntervalMs);

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void syncActive();
      }
    }

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshList, syncActive]);

  const handleTyping = useCallback(() => {
    const time = Date.now();

    if (time - lastTypingSentRef.current < chatRules.typingThrottleMs) {
      return;
    }

    lastTypingSentRef.current = time;
    typingChannelRef.current?.sendTyping(viewerId);
  }, [viewerId]);

  async function send(draft: ChatDraft): Promise<string | null> {
    if (activeId === null) {
      return sendFailed;
    }

    pendingKeyRef.current += 1;
    const key = pendingKeyRef.current;
    const body = normaliseChatBody(draft.body);
    const reply = replyTo;
    const form = new FormData();

    form.set("conversationId", String(activeId));
    form.set("body", body);

    if (reply) {
      form.set("replyToId", String(reply.id));
    }

    if (draft.file) {
      form.set("file", draft.file);
    }

    if (draft.document) {
      form.set("documentId", String(draft.document.id));
    }

    setReplyTo(null);
    setPending((list) => [
      ...list,
      {
        key,
        body,
        attachmentName: draft.file?.name ?? draft.document?.fileName ?? null,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const result = await actions.send(form);
      const message = result.message;

      if (!message) {
        setReplyTo(reply);
        return result.error ?? sendFailed;
      }

      setMessages((current) => mergeMessages(current, [message]));
      setConversations((list) => {
        const chat = list.find((item) => item.id === activeId) ?? summary;

        return chat
          ? upsertChat(list, { ...chat, lastMessage: toLastMessage(message, "You"), unreadCount: 0 })
          : list;
      });

      return null;
    } catch {
      setReplyTo(reply);
      return sendFailed;
    } finally {
      setPending((list) => list.filter((item) => item.key !== key));
    }
  }

  function remove(message: ChatMessage) {
    setConfirm({
      title: "Delete message?",
      body: "This message will be deleted for everyone in this chat.",
      confirmLabel: "Delete for everyone",
      danger: true,
      onConfirm: () => void removeNow(message),
    });
  }

  async function removeNow(message: ChatMessage) {
    const result = await actions.remove(message.id);

    if (result.error) {
      setNotice({ text: result.error });
      return;
    }

    const deletedAt = new Date().toISOString();

    setMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, body: "", attachment: null, deletedAt } : item,
      ),
    );
    setConversations((list) =>
      list.map((chat) =>
        chat.lastMessage?.id === message.id
          ? { ...chat, lastMessage: deletedLastMessage(chat.lastMessage) }
          : chat,
      ),
    );

    if (replyTo?.id === message.id) {
      setReplyTo(null);
    }
  }

  async function saveToDocuments(message: Pick<ChatMessage, "id">) {
    const id = message.id;

    setSavingIds((current) => new Set(current).add(id));

    try {
      const result = await actions.saveToDocuments(id);

      if (result.notice) {
        setSavedIds((current) => new Set(current).add(id));
        setNotice({
          text: result.notice,
          link: { href: "/documents/manage", label: "Open My Documents" },
        });
      } else {
        setNotice({ text: result.error ?? "This file could not be saved. Please try again." });
      }
    } catch {
      setNotice({ text: "This file could not be saved. Please try again." });
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function saveStateFor(messageId: number): AttachmentSaveState {
    if (savedIds.has(messageId)) {
      return "saved";
    }

    return savingIds.has(messageId) ? "saving" : "idle";
  }

  async function loadOlder() {
    const first = messages[0];

    if (activeId === null || !first) {
      return;
    }

    setLoadingOlder(true);

    try {
      const result = await actions.loadOlder(activeId, first.id);

      if (result) {
        setMessages((current) => mergeMessages(current, result.messages));
        setHasMore(result.hasMore);
      } else {
        setNotice({ text: "Earlier messages could not be loaded. Please try again." });
      }
    } finally {
      setLoadingOlder(false);
    }
  }

  /** Plays the highlight animation; choosing the same message again replays it. */
  function highlight(messageId: number) {
    window.clearTimeout(highlightTimerRef.current);
    setHighlightedId(null);

    // Remove the class for one frame so the CSS animation restarts.
    window.requestAnimationFrame(() => {
      setHighlightedId(messageId);
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedId((current) => (current === messageId ? null : current));
      }, highlightDurationMs);
    });
  }

  /** Scrolls to a message, loading it first when it is further up the history. */
  async function jumpTo(messageId: number) {
    if (activeId === null) {
      return;
    }

    if (!messagesRef.current.some((message) => message.id === messageId)) {
      const result = await actions.loadFrom(activeId, messageId);

      if (!result || !result.messages.some((message) => message.id === messageId)) {
        setNotice({ text: "That message is no longer available." });
        return;
      }

      // The loaded range runs from this message to the newest, with no gaps.
      messagesRef.current = mergeMessages(messagesRef.current, result.messages);
      setMessages((current) => mergeMessages(current, result.messages));
      setHasMore(result.hasMore);
    }

    scrollToMessage(messageId, highlight);
  }

  /** Applies a list or panel action locally after the server accepts it. */
  function applyLocally(chatId: number, action: ChatSettingAction) {
    const time = new Date().toISOString();
    const update = (change: (chat: ChatSummary) => ChatSummary) => {
      setConversations((list) => sortChats(list.map((chat) => (chat.id === chatId ? change(chat) : chat))));

      if (chatId === activeId) {
        setSummary((current) => current && change(current));
      }
    };

    switch (action) {
      case "pin":
        update((chat) => ({ ...chat, pinnedAt: time, hidden: false }));
        break;
      case "unpin":
        update((chat) => ({ ...chat, pinnedAt: null }));
        break;
      case "mute":
        update((chat) => ({ ...chat, muted: true }));
        break;
      case "unmute":
        update((chat) => ({ ...chat, muted: false }));
        break;
      case "clear":
        update((chat) => ({ ...chat, clearedAt: time, lastMessage: null, unreadCount: 0 }));

        if (chatId === activeId) {
          messagesRef.current = [];
          setMessages([]);
          setHasMore(false);
          setReplyTo(null);
          setDetails((current) => current && { ...current, files: [] });
        }
        break;
      case "delete":
        setConversations((list) => list.filter((chat) => chat.id !== chatId));

        if (chatId === activeId) {
          router.push("/chats");
        }
        break;
      case "block":
      case "unblock":
        // Who may send depends on both students, so ask the server.
        if (chatId === activeId) {
          void syncActive();
        }

        void refreshList();
        break;
    }

    notifyChatsChanged();
  }

  async function runSetting(chatId: number, action: ChatSettingAction) {
    const result = await actions.applySetting(chatId, action);

    if (result.error) {
      setNotice({ text: result.error });
      return;
    }

    applyLocally(chatId, action);

    if (action === "block") {
      setNotice({ text: "Blocked. You can unblock from the contact info." });
    }
  }

  /** List-menu and contact-info actions; the destructive ones ask first. */
  function requestSetting(chat: ChatSummary, action: ChatSettingAction) {
    const copy = confirmCopy(chat, action);

    if (!copy) {
      void runSetting(chat.id, action);
      return;
    }

    setConfirm({ ...copy, onConfirm: () => void runSetting(chat.id, action) });
  }

  /** Runs a group command, then refreshes what it changed. */
  async function runGroupCommand(chatId: number, command: ChatGroupCommand): Promise<string | null> {
    const result = await actions.groupCommand(chatId, command);

    if (result.error) {
      return result.error;
    }

    // The event message also arrives through Realtime; refreshing now shows
    // the change straight away to the student who made it.
    if (chatId === activeId) {
      void syncActive();
      void reloadMembers();
    }

    void refreshList();
    notifyChatsChanged();

    return null;
  }

  /** Group info and list-menu commands; removing, leaving and disbanding ask first. */
  function requestGroupCommand(chat: ChatSummary, command: ChatGroupCommand): Promise<string | null> {
    const copy = groupConfirmCopy(chat, command, nameFor);

    if (!copy) {
      return runGroupCommand(chat.id, command);
    }

    setConfirm({
      ...copy,
      onConfirm: () => {
        void runGroupCommand(chat.id, command).then((error) => {
          if (error) {
            setNotice({ text: error });
          }
        });
      },
    });

    return Promise.resolve(null);
  }

  /** Opens the call page for this chat's call, starting one if asked to. */
  async function openCall(start: boolean) {
    if (activeId === null) {
      return;
    }

    setCallBusy(true);

    try {
      const result = await actions.openCall(activeId, start);

      if (result.callId !== undefined) {
        router.push(videoCallHref(result.callId));
        return;
      }

      setNotice({
        text: start ? (result.error ?? "The call could not be started.") : "This call has ended. Use the video button to start a new one.",
      });
    } catch {
      setNotice({ text: "The call could not be opened. Please try again." });
    } finally {
      setCallBusy(false);
    }
  }

  async function createGroup(title: string, memberIds: string[]): Promise<string | null> {
    try {
      const result = await actions.createGroup(title, memberIds);

      if (result.groupId === undefined) {
        return result.error ?? "The group could not be created. Please try again.";
      }

      router.push(chatHref(result.groupId));
      return null;
    } catch {
      return "The group could not be created. Please try again.";
    }
  }

  async function respondToInvite(invite: ChatGroupInvite, accept: boolean) {
    try {
      const result = await actions.respondToInvite(invite.id, accept);

      if (result.error) {
        setNotice({ text: result.error });
        void refreshList();
        return;
      }

      setInvites((list) => list.filter((item) => item.id !== invite.id));

      if (accept && result.groupId !== undefined) {
        router.push(chatHref(result.groupId));
      } else if (result.notice) {
        setNotice({ text: result.notice });
      }
    } catch {
      setNotice({ text: "The invitation could not be answered. Please try again." });
    }
  }

  /** Toggles Contact or Group info; reloads it each time so newly shared files appear. */
  async function openProfile() {
    if (sidePanel === "profile") {
      setSidePanel(null);
      return;
    }

    setSidePanel("profile");

    if (activeId === null || detailsLoading) {
      return;
    }

    void reloadMembers();

    setDetailsLoading(true);

    try {
      const loaded = await actions.loadDetails(activeId);

      if (loaded) {
        setDetails(loaded);
      } else if (!details) {
        setNotice({ text: "Contact info could not be loaded. Please try again." });
      }
    } finally {
      setDetailsLoading(false);
    }
  }

  function selectSearchResult(messageId: number) {
    // A narrow chat is covered by the panel instead of sitting beside it,
    // so close the panel to reveal the message.
    const pane = document.querySelector<HTMLElement>(".chat-pane");

    if (!pane || pane.clientWidth < sidePanelBesideMinWidth) {
      setSidePanel(null);
    }

    void jumpTo(messageId);
  }

  async function report(reason: ChatReportReason, text: string, block: boolean) {
    if (activeId === null) {
      return "This chat could not be reported.";
    }

    const result = await actions.report(activeId, reason, text, block);

    if (result.error) {
      return result.error;
    }

    setNotice({ text: result.notice ?? "Thanks. Your report was sent." });

    if (block) {
      applyLocally(activeId, "block");
    }

    return null;
  }

  function dropFiles(files: readonly File[]) {
    const [file] = files;

    if (!file) {
      return;
    }

    if (files.length > 1) {
      setNotice({ text: "Only one file can be sent at a time, so the first one was attached." });
    }

    composerRef.current?.attachFile(file);
  }

  const reply =
    replyTo && summary
      ? {
          name: replyTo.senderId === viewerId ? "yourself" : nameFor(replyTo.senderId),
          text: replyTo.body.trim() || replyTo.attachment?.name || "Attachment",
        }
      : null;
  const typingName = typingUserId && summary?.canSend ? nameFor(typingUserId) : null;

  return (
    <div className={activeId === null ? "chat-layout" : "chat-layout has-active"}>
      <ChatList
        viewerId={viewerId}
        conversations={conversations}
        invites={invites}
        activeId={activeId}
        contacts={model.contacts}
        now={now}
        onAction={requestSetting}
        onLeaveGroup={(chat) => void requestGroupCommand(chat, { type: "leave" })}
        onRespondInvite={respondToInvite}
        onCreateGroup={createGroup}
      />

      {summary ? (
        <ChatConversation
          summary={summary}
          viewerId={viewerId}
          messages={messages}
          pending={pending}
          hasMore={hasMore}
          loadingOlder={loadingOlder}
          firstUnreadId={active?.firstUnreadId ?? null}
          typingName={typingName}
          members={members}
          nameFor={nameFor}
          highlightedId={highlightedId}
          now={now}
          onLoadOlder={() => void loadOlder()}
          onReply={setReplyTo}
          onDelete={remove}
          onJumpTo={(messageId) => void jumpTo(messageId)}
          savedIds={savedIds}
          savingIds={savingIds}
          onSaveToDocuments={(message) => void saveToDocuments(message)}
          onOpenProfile={() => void openProfile()}
          onOpenSearch={() => setSidePanel((current) => (current === "search" ? null : "search"))}
          sidePanelOpen={sidePanel !== null}
          onCloseSidePanel={() => setSidePanel(null)}
          onUnblock={() => void runSetting(summary.id, "unblock")}
          onDeleteChat={() => requestSetting(summary, "delete")}
          onCall={(start) => void openCall(start)}
          callBusy={callBusy}
          onDropFiles={dropFiles}
          composer={
            <ChatComposer
              ref={composerRef}
              documents={model.documents}
              reply={reply}
              onCancelReply={() => setReplyTo(null)}
              onTyping={handleTyping}
              onSend={send}
            />
          }
          sidePanels={
            <>
              {summary.group ? (
                <ChatGroupPanel
                  open={sidePanel === "profile"}
                  summary={summary}
                  members={members}
                  contacts={model.contacts}
                  details={details}
                  loading={detailsLoading}
                  viewerId={viewerId}
                  now={now}
                  saveStateFor={saveStateFor}
                  onSaveToDocuments={(message) => void saveToDocuments(message)}
                  onCommand={(command) => requestGroupCommand(summary, command)}
                  onAction={(action) => requestSetting(summary, action)}
                  onClose={() => setSidePanel(null)}
                />
              ) : summary.other ? (
                <ChatProfilePanel
                  open={sidePanel === "profile"}
                  summary={summary}
                  other={summary.other}
                  details={details}
                  loading={detailsLoading}
                  viewerId={viewerId}
                  now={now}
                  saveStateFor={saveStateFor}
                  onSaveToDocuments={(message) => void saveToDocuments(message)}
                  onAction={(action) => requestSetting(summary, action)}
                  onReport={() => setReportOpen(true)}
                  onClose={() => setSidePanel(null)}
                />
              ) : null}
              <ChatSearchPanel
                open={sidePanel === "search"}
                scope={summary.group ? `in ${summary.group.title}` : `with ${chatName(summary)}`}
                viewerId={viewerId}
                nameFor={nameFor}
                now={now}
                onSearch={(query) => actions.search(summary.id, query)}
                onSelect={selectSearchResult}
                onClose={() => setSidePanel(null)}
              />
            </>
          }
        />
      ) : (
        <section className="chat-pane chat-empty" aria-label="No chat selected">
          <ChatBubbleIcon />
          <h2>Your study buddy chats</h2>
          <p>
            Pick a chat on the left, or use the pencil button to message a study buddy or start a
            small study group.
          </p>
        </section>
      )}

      <ChatConfirmDialog request={confirm} onClose={() => setConfirm(null)} />

      {summary?.other ? (
        <ChatReportDialog
          open={reportOpen}
          otherName={summary.other.fullName}
          alreadyBlocked={summary.blockedByMe}
          onSubmit={report}
          onClose={() => setReportOpen(false)}
        />
      ) : null}

      {notice ? (
        <div className="chat-toast" role={notice.link ? "status" : "alert"}>
          <span>{notice.text}</span>
          {notice.link ? <Link href={notice.link.href}>{notice.link.label}</Link> : null}
          <button
            className="chat-icon-button small"
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}
