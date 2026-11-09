import type { SupabaseClient } from "@supabase/supabase-js";

import type { NotificationRepository } from "@/interfaces/repositories/notification.repository";
import {
  isNotificationType,
  type AppNotification,
} from "@/models/notifications/notification.model";

interface ActorRow {
  full_name: string;
  username: string | null;
}

interface NotificationRow {
  id: number;
  type: string;
  conversation_id: number | null;
  video_call_id: number | null;
  read_at: string | null;
  created_at: string;
  actor: ActorRow | ActorRow[] | null;
}

function toNotification(row: NotificationRow): AppNotification | null {
  if (!isNotificationType(row.type)) {
    return null;
  }

  const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;

  return {
    id: row.id,
    type: row.type,
    actorName: actor?.full_name.trim() || actor?.username || "A student",
    conversationId: row.conversation_id,
    videoCallId: row.video_call_id,
    read: row.read_at !== null,
    createdAt: row.created_at,
  };
}

export class SupabaseNotificationRepository implements NotificationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listRecent(limit: number): Promise<AppNotification[]> {
    // Row-level security limits every query to the signed-in recipient.
    const { data, error } = await this.supabase
      .from("notifications")
      .select(
        "id, type, conversation_id, video_call_id, read_at, created_at, actor:profiles!notifications_actor_id_fkey(full_name, username)",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Unable to load notifications: ${error.message}`);
    }

    return (data as NotificationRow[])
      .map(toNotification)
      .filter((notification) => notification !== null);
  }

  async countUnread(): Promise<number> {
    const { count, error } = await this.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);

    if (error) {
      throw new Error(`Unable to count notifications: ${error.message}`);
    }

    return count ?? 0;
  }

  async markAllRead(): Promise<void> {
    const { error } = await this.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);

    if (error) {
      throw new Error(`Unable to update notifications: ${error.message}`);
    }
  }
}
