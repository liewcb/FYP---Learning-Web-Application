import type { ChatMessageEvent, ChatReceiptEvent } from "@/models/chat/chat.model";

export interface ChatInboxHandlers {
  onMessageInserted(event: ChatMessageEvent): void;
  /** A message was deleted for everyone. */
  onMessageUpdated(event: ChatMessageEvent): void;
  /** A member's delivered or read time moved forward. */
  onReceipt(event: ChatReceiptEvent): void;
  /** The connection came back after a drop; refetch anything missed. */
  onReconnected(): void;
}

export interface ChatTypingChannel {
  sendTyping(userId: string): void;
  leave(): void;
}

/** Live updates for the chat page, used from the browser. */
export interface ChatRealtime {
  /** Changes in every conversation the student belongs to. Returns unsubscribe. */
  watchInbox(handlers: ChatInboxHandlers): () => void;
  /** Typing indicator for one conversation. */
  joinConversation(
    conversationId: number,
    onTyping: (userId: string) => void,
  ): ChatTypingChannel;
}
