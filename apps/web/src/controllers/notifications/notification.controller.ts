import type { NotificationRepository } from "@/interfaces/repositories/notification.repository";
import {
  notificationRules,
  type NotificationSummary,
} from "@/models/notifications/notification.model";

export class NotificationController {
  constructor(private readonly notifications: NotificationRepository) {}

  async summary(): Promise<NotificationSummary> {
    const [items, unreadCount] = await Promise.all([
      this.notifications.listRecent(notificationRules.recentLimit),
      this.notifications.countUnread(),
    ]);

    return { items, unreadCount };
  }

  markAllRead(): Promise<void> {
    return this.notifications.markAllRead();
  }
}
