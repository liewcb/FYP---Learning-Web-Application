import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ChatRepository,
  ListChatMessagesOptions,
} from "@/interfaces/repositories/chat.repository";
import {
  academicLine,
  chatDeleteOutcomes,
  chatSendOutcomes,
  groupInitials,
  isChatEvent,
  participantInitials,
  participantName,
  type ChatDeleteOutcome,
  type ChatMessageRecord,
  type ChatReplyPreview,
  type ChatReportOutcome,
  type ChatReportReason,
  type ChatSearchResult,
  type ChatSendOutcome,
  type ChatSettingAction,
  type ChatSummary,
  type SendChatMessageInput,
} from "@/models/chat/chat.model";
import { loadAvatarUrls } from "@/lib/supabase/repositories/avatar-urls";

const reportOutcomes = new Set<ChatReportOutcome>([
  "reported",
  "duplicate",
  "invalid",
  "not_found",
  "unauthenticated",
]);

/** Database function and arguments behind each chat setting. */
const settingCalls: Record<
  ChatSettingAction,
  { readonly fn: string; readonly args: Record<string, boolean> }
> = {
  pin: { fn: "set_chat_pinned", args: { p_pinned: true } },
  unpin: { fn: "set_chat_pinned", args: { p_pinned: false } },
  mute: { fn: "set_chat_muted", args: { p_muted: true } },
  unmute: { fn: "set_chat_muted", args: { p_muted: false } },
  clear: { fn: "clear_chat", args: {} },
  delete: { fn: "delete_chat_for_me", args: {} },
  block: { fn: "set_chat_blocked", args: { p_blocked: true } },
  unblock: { fn: "set_chat_blocked", args: { p_blocked: false } },
};

/** Escapes LIKE wildcards so the search matches the typed text literally. */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

interface ChatSummaryRow {
  conversation_id: number;
  kind: string;
  group_title: string | null;
  group_admin_id: string | null;
  group_member_count: number | null;
  group_disbanded: boolean;
  my_left_reason: "left" | "removed" | null;
  other_id: string | null;
  other_full_name: string | null;
  other_username: string | null;
  other_academic_major: string | null;
  other_year_of_study: number | null;
  other_last_seen_at: string | null;
  can_send: boolean;
  is_buddy: boolean;
  blocked_by_me: boolean;
  blocked_me: boolean;
  my_last_read_at: string | null;
  other_last_delivered_at: string | null;
  other_last_read_at: string | null;
  pinned_at: string | null;
  muted: boolean;
  cleared_at: string | null;
  hidden: boolean;
  last_message_id: number | null;
  last_message_sender_id: string | null;
  last_message_sender_name: string | null;
  last_message_body: string | null;
  last_message_attachment_name: string | null;
  last_message_deleted: boolean | null;
  last_message_event: string | null;
  last_message_event_user_id: string | null;
  last_message_event_user_name: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
}

interface ChatMessageRow {
  id: number;
  conversation_id: number;
  sender_id: string;
  body: string;
  reply_to_id: number | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  event: string | null;
  event_user_id: string | null;
  video_call_id: number | null;
  call_ended_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

const messageColumns =
  "id, conversation_id, sender_id, body, reply_to_id, attachment_path, attachment_name, attachment_type, attachment_size, event, event_user_id, video_call_id, call_ended_at, created_at, deleted_at";

const sendOutcomes = new Set<ChatSendOutcome>(chatSendOutcomes);
const deleteOutcomes = new Set<ChatDeleteOutcome>(chatDeleteOutcomes);

function outcome<T extends string>(value: unknown, allowed: Set<T>, name: string): T {
  if (typeof value === "string" && allowed.has(value as T)) {
    return value as T;
  }

  throw new Error(`Unexpected ${name} result: ${String(value)}`);
}

/** Table-returning functions come back as an array with one row. */
function firstRow<T>(data: unknown): T | null {
  return Array.isArray(data) ? ((data[0] as T | undefined) ?? null) : null;
}

function toSummary(row: ChatSummaryRow, avatars: ReadonlyMap<string, string>): ChatSummary {
  const isGroup = row.kind === "group";

  return {
    id: row.conversation_id,
    kind: isGroup ? "group" : "direct",
    other:
      isGroup || row.other_id === null
        ? null
        : {
            id: row.other_id,
            fullName: participantName(row.other_full_name ?? "", row.other_username),
            username: row.other_username,
            initials: participantInitials(row.other_full_name ?? "", row.other_username),
            avatarUrl: avatars.get(row.other_id) ?? null,
            academicLine: academicLine(row.other_academic_major, row.other_year_of_study),
            lastSeenAt: row.other_last_seen_at,
          },
    group: isGroup
      ? {
          title: row.group_title ?? "Group",
          initials: groupInitials(row.group_title ?? "Group"),
          adminId: row.group_admin_id,
          memberCount: row.group_member_count ?? 0,
          disbanded: row.group_disbanded,
          leftReason: row.my_left_reason,
        }
      : null,
    canSend: row.can_send,
    isBuddy: row.is_buddy,
    blockedByMe: row.blocked_by_me,
    blockedMe: row.blocked_me,
    pinnedAt: row.pinned_at,
    muted: row.muted,
    clearedAt: row.cleared_at,
    hidden: row.hidden,
    myLastReadAt: row.my_last_read_at,
    otherReceipt: {
      lastDeliveredAt: row.other_last_delivered_at,
      lastReadAt: row.other_last_read_at,
    },
    lastMessage:
      row.last_message_id === null || row.last_message_sender_id === null
        ? null
        : {
            id: row.last_message_id,
            senderId: row.last_message_sender_id,
            senderName: row.last_message_sender_name ?? "Student",
            body: row.last_message_body ?? "",
            attachmentName: row.last_message_attachment_name,
            deleted: row.last_message_deleted ?? false,
            event: isChatEvent(row.last_message_event) ? row.last_message_event : null,
            eventUserId: row.last_message_event_user_id,
            eventUserName: row.last_message_event_user_name,
            createdAt: row.last_message_at ?? row.created_at,
          },
    unreadCount: row.unread_count,
    createdAt: row.created_at,
  };
}

function toReplyPreview(row: ChatMessageRow): ChatReplyPreview {
  return {
    id: row.id,
    senderId: row.sender_id,
    body: row.body,
    attachmentName: row.attachment_name,
    deleted: row.deleted_at !== null,
  };
}

function toRecord(
  row: ChatMessageRow,
  replies: ReadonlyMap<number, ChatReplyPreview>,
): ChatMessageRecord {
  const hasAttachment =
    row.attachment_path !== null &&
    row.attachment_name !== null &&
    row.attachment_type !== null &&
    row.attachment_size !== null;

  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    replyTo: row.reply_to_id === null ? null : (replies.get(row.reply_to_id) ?? null),
    attachment: hasAttachment
      ? {
          path: row.attachment_path!,
          name: row.attachment_name!,
          mimeType: row.attachment_type!,
          sizeBytes: Number(row.attachment_size),
        }
      : null,
    event: isChatEvent(row.event) ? row.event : null,
    eventUserId: row.event_user_id,
    call: row.video_call_id === null ? null : { id: row.video_call_id, endedAt: row.call_ended_at },
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

export class SupabaseChatRepository implements ChatRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async openDirectChat(studentId: string): Promise<number | null> {
    const { data, error } = await this.supabase.rpc("open_direct_chat", {
      p_other: studentId,
    });

    if (error) {
      throw new Error(`Unable to open chat: ${error.message}`);
    }

    return typeof data === "number" ? data : null;
  }

  async listConversations(): Promise<ChatSummary[]> {
    const { data, error } = await this.supabase.rpc("list_my_chats");

    if (error) {
      throw new Error(`Unable to load chats: ${error.message}`);
    }

    const rows = data as ChatSummaryRow[];
    const avatars = await loadAvatarUrls(this.supabase, rows.map((row) => row.other_id));

    return rows.map((row) => toSummary(row, avatars));
  }

  async findConversation(conversationId: number): Promise<ChatSummary | null> {
    const { data, error } = await this.supabase.rpc("list_my_chats", {
      p_conversation: conversationId,
    });

    if (error) {
      throw new Error(`Unable to load chat: ${error.message}`);
    }

    const row = firstRow<ChatSummaryRow>(data);

    return row ? toSummary(row, await loadAvatarUrls(this.supabase, [row.other_id])) : null;
  }

  async listMessages(
    conversationId: number,
    options: ListChatMessagesOptions,
  ): Promise<ChatMessageRecord[]> {
    let query = this.supabase
      .from("chat_messages")
      .select(messageColumns)
      .eq("conversation_id", conversationId)
      .order("id", { ascending: false })
      .limit(options.limit);

    if (options.beforeId !== undefined) {
      query = query.lt("id", options.beforeId);
    }

    if (options.afterId !== undefined) {
      query = query.gt("id", options.afterId);
    }

    if (options.fromId !== undefined) {
      query = query.gte("id", options.fromId);
    }

    if (options.clearedAt) {
      query = query.gt("created_at", options.clearedAt);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to load messages: ${error.message}`);
    }

    return this.withReplies(data as ChatMessageRow[]);
  }

  async listAttachments(
    conversationId: number,
    options: { readonly limit: number; readonly clearedAt: string | null },
  ): Promise<ChatMessageRecord[]> {
    let query = this.supabase
      .from("chat_messages")
      .select(messageColumns)
      .eq("conversation_id", conversationId)
      .not("attachment_path", "is", null)
      .is("deleted_at", null)
      .order("id", { ascending: false })
      .limit(options.limit);

    if (options.clearedAt) {
      query = query.gt("created_at", options.clearedAt);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to load shared files: ${error.message}`);
    }

    return (data as ChatMessageRow[]).map((row) => toRecord(row, new Map()));
  }

  async searchMessages(
    conversationId: number,
    text: string,
    options: { readonly limit: number; readonly clearedAt: string | null },
  ): Promise<ChatSearchResult[]> {
    let query = this.supabase
      .from("chat_messages")
      .select("id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .is("event", null)
      .ilike("body", likePattern(text))
      .order("id", { ascending: false })
      .limit(options.limit);

    if (options.clearedAt) {
      query = query.gt("created_at", options.clearedAt);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to search messages: ${error.message}`);
    }

    return (data as Pick<ChatMessageRow, "id" | "sender_id" | "body" | "created_at">[]).map(
      (row) => ({
        messageId: row.id,
        senderId: row.sender_id,
        body: row.body,
        createdAt: row.created_at,
      }),
    );
  }

  async findMessage(messageId: number): Promise<ChatMessageRecord | null> {
    const { data, error } = await this.supabase
      .from("chat_messages")
      .select(messageColumns)
      .eq("id", messageId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load message: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const [record] = await this.withReplies([data as ChatMessageRow]);

    return record;
  }

  async sendMessage(
    input: SendChatMessageInput,
  ): Promise<{ readonly outcome: ChatSendOutcome; readonly messageId: number | null }> {
    const { data, error } = await this.supabase.rpc("send_chat_message", {
      p_conversation: input.conversationId,
      p_body: input.body,
      p_reply_to: input.replyToId,
      p_attachment_path: input.attachment?.path ?? null,
      p_attachment_name: input.attachment?.name ?? null,
      p_attachment_type: input.attachment?.mimeType ?? null,
      p_attachment_size: input.attachment?.sizeBytes ?? null,
    });

    if (error) {
      throw new Error(`Unable to send message: ${error.message}`);
    }

    const row = firstRow<{ outcome: unknown; message_id: number | null }>(data);

    return {
      outcome: outcome(row?.outcome, sendOutcomes, "send message"),
      messageId: row?.message_id ?? null,
    };
  }

  async deleteMessage(
    messageId: number,
  ): Promise<{ readonly outcome: ChatDeleteOutcome; readonly removedPath: string | null }> {
    const { data, error } = await this.supabase.rpc("delete_chat_message", {
      p_message: messageId,
    });

    if (error) {
      throw new Error(`Unable to delete message: ${error.message}`);
    }

    const row = firstRow<{ outcome: unknown; removed_path: string | null }>(data);

    return {
      outcome: outcome(row?.outcome, deleteOutcomes, "delete message"),
      removedPath: row?.removed_path ?? null,
    };
  }

  async markRead(conversationId: number): Promise<void> {
    const { error } = await this.supabase.rpc("mark_chat_read", {
      p_conversation: conversationId,
    });

    if (error) {
      throw new Error(`Unable to mark chat as read: ${error.message}`);
    }
  }

  async syncInbox(): Promise<number> {
    const { data, error } = await this.supabase.rpc("sync_my_chats");

    if (error) {
      throw new Error(`Unable to sync chats: ${error.message}`);
    }

    return typeof data === "number" ? data : 0;
  }

  async applySetting(conversationId: number, action: ChatSettingAction): Promise<string> {
    const call = settingCalls[action];
    const { data, error } = await this.supabase.rpc(call.fn, {
      p_conversation: conversationId,
      ...call.args,
    });

    if (error) {
      throw new Error(`Unable to update chat: ${error.message}`);
    }

    if (typeof data !== "string") {
      throw new Error(`Unexpected chat setting result: ${String(data)}`);
    }

    return data;
  }

  async report(input: {
    readonly conversationId: number;
    readonly reason: ChatReportReason;
    readonly details: string | null;
    readonly block: boolean;
  }): Promise<ChatReportOutcome> {
    const { data, error } = await this.supabase.rpc("report_chat", {
      p_conversation: input.conversationId,
      p_reason: input.reason,
      p_details: input.details,
      p_block: input.block,
    });

    if (error) {
      throw new Error(`Unable to report chat: ${error.message}`);
    }

    return outcome(data, reportOutcomes, "report chat");
  }

  async findProfile(conversationId: number): Promise<{
    readonly bio: string | null;
    readonly interests: readonly string[];
    readonly memberSince: string | null;
  } | null> {
    const { data, error } = await this.supabase.rpc("get_chat_profile", {
      p_conversation: conversationId,
    });

    if (error) {
      throw new Error(`Unable to load chat profile: ${error.message}`);
    }

    const row = firstRow<{ bio: string | null; interests: string[] | null; member_since: string | null }>(
      data,
    );

    return row
      ? { bio: row.bio, interests: row.interests ?? [], memberSince: row.member_since }
      : null;
  }

  /** Loads the messages that `rows` reply to, then maps everything. */
  private async withReplies(rows: readonly ChatMessageRow[]): Promise<ChatMessageRecord[]> {
    const loaded = new Map(rows.map((row) => [row.id, row]));
    const missing = [
      ...new Set(
        rows
          .map((row) => row.reply_to_id)
          .filter((id): id is number => id !== null && !loaded.has(id)),
      ),
    ];

    if (missing.length > 0) {
      const { data, error } = await this.supabase
        .from("chat_messages")
        .select(messageColumns)
        .in("id", missing);

      if (error) {
        throw new Error(`Unable to load replied messages: ${error.message}`);
      }

      for (const row of data as ChatMessageRow[]) {
        loaded.set(row.id, row);
      }
    }

    const replies = new Map(
      [...loaded.values()].map((row) => [row.id, toReplyPreview(row)]),
    );

    return rows.map((row) => toRecord(row, replies));
  }
}
