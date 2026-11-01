import type {
  ChatDeleteOutcome,
  ChatMessageRecord,
  ChatReportOutcome,
  ChatReportReason,
  ChatSearchResult,
  ChatSendOutcome,
  ChatSettingAction,
  ChatSummary,
  SendChatMessageInput,
} from "@/models/chat/chat.model";

export interface ListChatMessagesOptions {
  readonly limit: number;
  readonly beforeId?: number;
  readonly afterId?: number;
  /** Includes this message and everything newer (used to jump to a search result). */
  readonly fromId?: number;
  /** Hides messages from before the viewer's "clear chat". */
  readonly clearedAt?: string | null;
}

/** One-to-one chats of the signed-in student. */
export interface ChatRepository {
  /** Existing or new conversation with a study buddy; null when not allowed. */
  openDirectChat(studentId: string): Promise<number | null>;
  listConversations(): Promise<ChatSummary[]>;
  findConversation(conversationId: number): Promise<ChatSummary | null>;
  /** Newest first. */
  listMessages(conversationId: number, options: ListChatMessagesOptions): Promise<ChatMessageRecord[]>;
  findMessage(messageId: number): Promise<ChatMessageRecord | null>;
  /** Messages with an attachment, newest first. */
  listAttachments(
    conversationId: number,
    options: { readonly limit: number; readonly clearedAt: string | null },
  ): Promise<ChatMessageRecord[]>;
  /** Case-insensitive text search, newest first. */
  searchMessages(
    conversationId: number,
    query: string,
    options: { readonly limit: number; readonly clearedAt: string | null },
  ): Promise<ChatSearchResult[]>;
  sendMessage(
    input: SendChatMessageInput,
  ): Promise<{ readonly outcome: ChatSendOutcome; readonly messageId: number | null }>;
  /** Returns the removed attachment path so its file can be deleted. */
  deleteMessage(
    messageId: number,
  ): Promise<{ readonly outcome: ChatDeleteOutcome; readonly removedPath: string | null }>;
  markRead(conversationId: number): Promise<void>;
  /** Records presence, marks waiting messages delivered, returns unread chats. */
  syncInbox(): Promise<number>;
  /** Pin, mute, clear, delete or block. Returns the database outcome. */
  applySetting(conversationId: number, action: ChatSettingAction): Promise<string>;
  report(input: {
    readonly conversationId: number;
    readonly reason: ChatReportReason;
    readonly details: string | null;
    readonly block: boolean;
  }): Promise<ChatReportOutcome>;
  /** Bio, interests and join date of the other student. */
  findProfile(conversationId: number): Promise<{
    readonly bio: string | null;
    readonly interests: readonly string[];
    readonly memberSince: string | null;
  } | null>;
}
