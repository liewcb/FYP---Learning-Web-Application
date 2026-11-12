import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import type {
  ChatInboxHandlers,
  ChatRealtime,
  ChatTypingChannel,
} from "@/interfaces/services/chat-realtime.interface";
import {
  isChatEvent,
  type ChatMessageEvent,
  type ChatReceiptEvent,
} from "@/models/chat/chat.model";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toMessageEvent(row: Row): ChatMessageEvent | null {
  const id = Number(row.id);
  const conversationId = Number(row.conversation_id);

  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(conversationId)) {
    return null;
  }

  return {
    id,
    conversationId,
    senderId: text(row.sender_id),
    body: text(row.body),
    attachmentName: nullableText(row.attachment_name),
    event: isChatEvent(row.event) ? row.event : null,
    callId: Number.isSafeInteger(Number(row.video_call_id)) && row.video_call_id !== null ? Number(row.video_call_id) : null,
    callEndedAt: nullableText(row.call_ended_at),
    createdAt: text(row.created_at),
    deletedAt: nullableText(row.deleted_at),
  };
}

function toReceiptEvent(row: Row): ChatReceiptEvent | null {
  const conversationId = Number(row.conversation_id);

  if (!Number.isSafeInteger(conversationId)) {
    return null;
  }

  return {
    conversationId,
    userId: text(row.user_id),
    lastDeliveredAt: nullableText(row.last_delivered_at),
    lastReadAt: nullableText(row.last_read_at),
  };
}

/**
 * Database changes arrive through Postgres Changes, filtered by the chat
 * tables' row-level security. Typing uses private broadcast channels that
 * only the chat's current members may join (see the group_chats migration).
 */
export class SupabaseChatRealtime implements ChatRealtime {
  constructor(private readonly supabase: SupabaseClient) {}

  watchInbox(handlers: ChatInboxHandlers): () => void {
    let channel: RealtimeChannel | null = null;
    let closed = false;
    let subscribedOnce = false;

    void this.supabase.realtime.setAuth().then(() => {
      if (closed) {
        return;
      }

      channel = this.supabase
        .channel(`chat-inbox:${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages" },
          (payload) => {
            const event = toMessageEvent(payload.new as Row);

            if (event) {
              handlers.onMessageInserted(event);
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "chat_messages" },
          (payload) => {
            const event = toMessageEvent(payload.new as Row);

            if (event) {
              handlers.onMessageUpdated(event);
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "chat_members" },
          (payload) => {
            const event = toReceiptEvent(payload.new as Row);

            if (event) {
              handlers.onReceipt(event);
            }
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") {
            return;
          }

          if (subscribedOnce) {
            handlers.onReconnected();
          }

          subscribedOnce = true;
        });
    });

    return () => {
      closed = true;

      if (channel) {
        void this.supabase.removeChannel(channel);
      }
    };
  }

  joinConversation(
    conversationId: number,
    onTyping: (userId: string) => void,
  ): ChatTypingChannel {
    let channel: RealtimeChannel | null = null;
    let closed = false;

    void this.supabase.realtime.setAuth().then(() => {
      if (closed) {
        return;
      }

      channel = this.supabase
        .channel(`chat:${conversationId}`, {
          config: { private: true, broadcast: { self: false } },
        })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const userId = (payload as Row | undefined)?.userId;

          if (typeof userId === "string") {
            onTyping(userId);
          }
        })
        .subscribe();
    });

    return {
      sendTyping(userId: string) {
        if (channel?.state === "joined") {
          void channel.send({ type: "broadcast", event: "typing", payload: { userId } });
        }
      },
      leave: () => {
        closed = true;

        if (channel) {
          void this.supabase.removeChannel(channel);
        }
      },
    };
  }
}
