export const adminForumPath = "/admin/forum";

export const forumModerationTabs = ["reports", "threads", "comments"] as const;
export type ForumModerationTab = (typeof forumModerationTabs)[number];

export const forumModerationTabLabels: Record<ForumModerationTab, string> = {
  reports: "Reports",
  threads: "Threads",
  comments: "Comments",
};

export const forumContentStatuses = ["all", "published", "hidden", "deleted"] as const;
export type ForumContentStatusFilter = (typeof forumContentStatuses)[number];

export const forumReportStatuses = ["pending", "actioned", "dismissed", "all"] as const;
export type ForumReportStatusFilter = (typeof forumReportStatuses)[number];

export type ModeratedStatus = "published" | "hidden" | "deleted";
export type ModerationKind = "thread" | "comment";
export type ModerationAction = "hide" | "restore" | "delete";

export const moderatedStatusLabels: Record<ModeratedStatus, string> = {
  published: "Published",
  hidden: "Hidden",
  deleted: "Removed",
};

export const reportStatusLabels: Record<string, string> = {
  pending: "Pending",
  actioned: "Actioned",
  dismissed: "Dismissed",
  reviewed: "Reviewed",
};

export const moderationReasonMax = 500;

export interface ForumModerationFilters {
  readonly tab: ForumModerationTab;
  readonly status: string;
  readonly search: string;
}

export interface ModeratedThread {
  readonly id: number;
  readonly title: string;
  readonly content: string;
  readonly status: ModeratedStatus;
  readonly authorName: string;
  readonly commentCount: number;
  readonly upvoteCount: number;
  readonly pendingReportCount: number;
  readonly createdAt: string;
}

export interface ModeratedComment {
  readonly id: number;
  readonly threadId: number;
  readonly threadTitle: string;
  readonly content: string;
  readonly status: ModeratedStatus;
  readonly authorName: string;
  readonly pendingReportCount: number;
  readonly createdAt: string;
}

export interface ForumReport {
  readonly id: number;
  readonly targetKind: ModerationKind;
  readonly targetId: number;
  readonly threadTitle: string;
  readonly targetContent: string;
  readonly targetStatus: ModeratedStatus;
  readonly targetAuthorName: string;
  readonly reporterName: string;
  readonly reason: string;
  readonly status: string;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

export type ForumModerationModel =
  | { readonly tab: "reports"; readonly filters: ForumModerationFilters; readonly reports: readonly ForumReport[]; readonly pendingCount: number }
  | { readonly tab: "threads"; readonly filters: ForumModerationFilters; readonly threads: readonly ModeratedThread[]; readonly pendingCount: number }
  | { readonly tab: "comments"; readonly filters: ForumModerationFilters; readonly comments: readonly ModeratedComment[]; readonly pendingCount: number };

export interface ModerationActionState {
  readonly error?: string;
  readonly notice?: string;
}

export type ModerationOutcome = "updated" | "unchanged" | "not_found" | "invalid" | "reason_required";

export const moderationMessages: Record<Exclude<ModerationOutcome, "updated">, string> = {
  unchanged: "Nothing changed. The post was already in that state.",
  not_found: "That post or report no longer exists.",
  invalid: "This moderation action could not be understood.",
  reason_required: "Give a reason. It is kept in the audit log.",
};

export const moderationNotices: Record<ModerationAction, string> = {
  hide: "Hidden from students. Related reports were marked as actioned.",
  delete: "Removed from the forum. Related reports were marked as actioned.",
  restore: "Restored and visible to students again.",
};

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseForumModerationFilters(params: {
  readonly tab?: SearchParamValue;
  readonly status?: SearchParamValue;
  readonly q?: SearchParamValue;
}): ForumModerationFilters {
  const tabValue = firstValue(params.tab);
  const tab = (forumModerationTabs as readonly string[]).includes(tabValue)
    ? (tabValue as ForumModerationTab)
    : "reports";
  const status = firstValue(params.status);
  const allowed: readonly string[] =
    tab === "reports" ? forumReportStatuses : forumContentStatuses;

  return {
    tab,
    status: allowed.includes(status) ? status : allowed[0],
    search: firstValue(params.q).trim().slice(0, 100),
  };
}

export function isModerationKind(value: string): value is ModerationKind {
  return value === "thread" || value === "comment";
}

export function isModerationAction(value: string): value is ModerationAction {
  return value === "hide" || value === "restore" || value === "delete";
}

export function toModeratedStatus(value: string): ModeratedStatus {
  return value === "hidden" || value === "deleted" ? value : "published";
}
