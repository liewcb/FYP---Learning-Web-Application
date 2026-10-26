import type { AppNotification } from "@/models/notifications/notification.model";

/** Notifications of the signed-in user. */
export interface NotificationRepository {
  listRecent(limit: number): Promise<AppNotification[]>;
  countUnread(): Promise<number>;
  markAllRead(): Promise<void>;
}
