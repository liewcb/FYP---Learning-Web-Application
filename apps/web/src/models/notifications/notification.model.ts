import { chatHref } from "@/models/chat/chat.model";
import {
  myReportsPath,
  resolutionSummaries,
  type ReportResolution,
} from "@/models/reports/report.model";
import { videoCallHref } from "@/models/video/video-call.model";

export const notificationTypes = [
  "study_buddy_request",
  "study_buddy_accepted",
  "group_invite",
  "group_invite_accepted",
  "video_call_started",
  "video_call_invite",
  "report_resolved",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export interface AppNotification {
  readonly id: number;
  readonly type: NotificationType;
  readonly actorName: string;
  /** The group chat a group notification is about. */
  readonly conversationId: number | null;
  /** The call a video call notification links to. */
  readonly videoCallId: number | null;
  /** The decided report a report notification is about. */
  readonly report: {
    readonly label: string;
    readonly resolution: ReportResolution | null;
  } | null;
  readonly read: boolean;
  readonly createdAt: string;
}

export interface NotificationSummary {
  readonly items: readonly AppNotification[];
  readonly unreadCount: number;
}

export const notificationRules = {
  recentLimit: 15,
  pollIntervalMs: 30_000,
} as const;

export function isNotificationType(value: string): value is NotificationType {
  return (notificationTypes as readonly string[]).includes(value);
}

export function notificationMessage(notification: AppNotification): string {
  switch (notification.type) {
    case "study_buddy_request":
      return `${notification.actorName} sent you a study buddy request.`;
    case "study_buddy_accepted":
      return `${notification.actorName} accepted your study buddy request.`;
    case "group_invite":
      return `${notification.actorName} invited you to a study group chat.`;
    case "group_invite_accepted":
      return `${notification.actorName} joined your study group chat.`;
    case "video_call_started":
      return `${notification.actorName} started a video call in your chat.`;
    case "video_call_invite":
      return `${notification.actorName} invited you to a video call.`;
    case "report_resolved": {
      const about = notification.report ? ` about ${notification.report.label}` : "";
      const outcome = notification.report?.resolution
        ? ` ${resolutionSummaries[notification.report.resolution]}`
        : "";

      return `Your report${about} was reviewed.${outcome}`;
    }
  }
}

export function notificationHref(notification: AppNotification): string {
  switch (notification.type) {
    case "study_buddy_request":
      return "/study-buddy?tab=requests";
    case "study_buddy_accepted":
      return "/study-buddy?tab=buddies";
    // Invitations are answered at the top of the chat list.
    case "group_invite":
      return "/chats";
    case "group_invite_accepted":
      return notification.conversationId === null ? "/chats" : chatHref(notification.conversationId);
    case "video_call_started":
    case "video_call_invite":
      return notification.videoCallId === null ? "/chats" : videoCallHref(notification.videoCallId);
    case "report_resolved":
      return myReportsPath;
  }
}

const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
});

export function formatNotificationTime(isoDate: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(isoDate)) / 60_000);

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} h ago`;
  }

  const days = Math.floor(hours / 24);

  return days < 7 ? `${days} d ago` : dateFormatter.format(new Date(isoDate));
}
