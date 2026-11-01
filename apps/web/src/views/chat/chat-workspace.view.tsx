"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ChatRealtime,
  ChatTypingChannel,
} from "@/interfaces/services/chat-realtime.interface";
import {
  chatRules,
  chatsChangedEvent,
  compareChats,
  normaliseChatBody,
  type ChatActionState,
  type ChatDeleteState,
  type ChatLastMessage,
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
  refreshList(): Promise<ChatSummary[] | null>;
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
}

type SidePanel = "profile" | "search" | null;

/** Confirmation copy for the actions that change or hide history. */
function confirmCopy(
  action: ChatSettingAction,
  name: string,
): Omit<ChatConfirmRequest, "onConfirm"> | null {
  switch (action) {
    case "clear":
      return {
        title: "Clear this chat?",
        body: `Messages with ${name} will be removed for you only. ${name} will still see them.`,
        confirmLabel: "Clear chat",
        danger: true,
      };
    case "delete":
      return {
        title: "Delete this chat?",
        body: `The chat with ${name} and its messages will be removed for you only. It comes back if ${name} sends a new message.`,
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

function toLastMessage(message: ChatMessage): ChatLastMessage {
  return {
    id: message.id,
    senderId: message.senderId,
    body: message.body,
    attachmentName: message.attachment?.name ?? null,
    deleted: message.deletedAt !== null,
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
  const otherId = active?.summary.other.id ?? null;

  const [conversations, setConversations] = useState<readonly ChatSummary[]>(
    model.conversations,
  );
  const [summary, setSummary] = useState<ChatSummary | null>(active?.summary ?? null);
  const [messages, setMessages] = useState<readonly ChatMessage[]>(active?.messages ?? []);
  const [hasMore, setHasMore] = useState(active?.hasMore ?? false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<readonly PendingChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState(false);
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
  // Starts from the server's clock so the first render matches hydration.
  const [now, setNow] = useState(() => Date.parse(model.generatedAt));
  const router = useRouter();
  const composerRef = useRef<ChatComposerHandle>(null);

  const messagesRef = useRef<readonly ChatMessage[]>(messages);
  const conversationsRef = useRef<readonly ChatSummary[]>(conversations);
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

          if (result.messages.some((message) => message.senderId !== viewerId)) {
            setTyping(false);
          }
        }
      } while (syncAgainRef.current);
    } finally {
      syncingRef.current = false;
    }

    notifyChatsChanged();
  }, [actions, activeId, viewerId]);

  const refreshList = useCallback(async () => {
    const list = await actions.refreshList();

    if (!list) {
      return;
    }

    setNow(Date.now());
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
        if (event.conversationId === activeId) {
          void syncActive();
          return;
        }

        notifyChatsChanged();

        if (!conversationsRef.current.some((chat) => chat.id === event.conversationId)) {
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
                      body: event.body,
                      attachmentName: event.attachmentName,
                      deleted: event.deletedAt !== null,
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
  }, [realtime, activeId, viewerId, syncActive, refreshList]);

  useEffect(() => {
    if (activeId === null || otherId === null) {
      return;
    }

    let hideTimer: number | undefined;
    const channel = realtime.joinConversation(activeId, (userId) => {
      if (userId !== otherId) {
        return;
      }

      setTyping(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setTyping(false), chatRules.typingVisibleMs);
    });

    typingChannelRef.current = channel;

    return () => {
      window.clearTimeout(hideTimer);
      channel.leave();
      typingChannelRef.current = null;
    };
  }, [realtime, activeId, otherId]);

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
          ? upsertChat(list, { ...chat, lastMessage: toLastMessage(message), unreadCount: 0 })
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
    const copy = confirmCopy(action, chat.other.fullName);

    if (!copy) {
      void runSetting(chat.id, action);
      return;
    }

    setConfirm({ ...copy, onConfirm: () => void runSetting(chat.id, action) });
  }

  /** Toggles Contact info; reloads it each time so newly shared files appear. */
  async function openProfile() {
    if (sidePanel === "profile") {
      setSidePanel(null);
      return;
    }

    setSidePanel("profile");

    if (activeId === null || detailsLoading) {
      return;
    }

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
          name: replyTo.senderId === viewerId ? "yourself" : summary.other.fullName,
          text: replyTo.body.trim() || replyTo.attachment?.name || "Attachment",
        }
      : null;

  return (
    <div className={activeId === null ? "chat-layout" : "chat-layout has-active"}>
      <ChatList
        viewerId={viewerId}
        conversations={conversations}
        activeId={activeId}
        contacts={model.contacts}
        now={now}
        onAction={requestSetting}
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
          typing={typing && summary.canSend}
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
              <ChatProfilePanel
                open={sidePanel === "profile"}
                summary={summary}
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
              <ChatSearchPanel
                open={sidePanel === "search"}
                otherName={summary.other.fullName}
                viewerId={viewerId}
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
            Pick a chat on the left, or use the pencil button to message one of your study
            buddies.
          </p>
        </section>
      )}

      <ChatConfirmDialog request={confirm} onClose={() => setConfirm(null)} />

      {summary ? (
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
