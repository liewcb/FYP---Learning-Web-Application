/**
 * Reports: students report a profile, a chat message, a forum post or
 * comment, or a library material; administrators decide each report and the
 * reporter is notified of the outcome.
 */

export const reportTargetTypes = [
  "user",
  "chat_message",
  "forum_thread",
  "forum_comment",
  "library_material",
] as const;

export type ReportTargetType = (typeof reportTargetTypes)[number];

export const reportTargetLabels: Record<ReportTargetType, string> = {
  user: "Profile",
  chat_message: "Chat message",
  forum_thread: "Forum post",
  forum_comment: "Forum comment",
  library_material: "Library material",
};

/** Up to five letters, for the small type badge on a report card. */
export const reportTargetCodes: Record<ReportTargetType, string> = {
  user: "USER",
  chat_message: "MSG",
  forum_thread: "POST",
  forum_comment: "REPLY",
  library_material: "LIB",
};

export const reportReasons = [
  { value: "spam", label: "Spam or advertising" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate_speech", label: "Hate speech or threats" },
  { value: "inappropriate", label: "Inappropriate or offensive content" },
  { value: "impersonation", label: "Pretending to be someone else" },
  { value: "academic_dishonesty", label: "Cheating or selling assignments" },
  { value: "copyright", label: "Copied without permission" },
  { value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof reportReasons)[number]["value"];

export const reportRules = {
  detailsMax: 1000,
  messageMax: 500,
  noteMax: 500,
} as const;

export function isReportTargetType(value: unknown): value is ReportTargetType {
  return typeof value === "string" && (reportTargetTypes as readonly string[]).includes(value);
}

export function isReportReason(value: unknown): value is ReportReason {
  return reportReasons.some((reason) => reason.value === value);
}

export function reportReasonLabel(value: string): string {
  return reportReasons.find((reason) => reason.value === value)?.label ?? value;
}

/** What to report: content by its id, or a profile by the student's id. */
export type ReportTarget =
  | { readonly type: "user"; readonly userId: string }
  | { readonly type: Exclude<ReportTargetType, "user">; readonly id: number };

export interface SubmitReportInput {
  readonly target: ReportTarget;
  readonly reason: ReportReason;
  readonly details: string | null;
}

export type ReportOutcome =
  | "reported"
  | "duplicate"
  | "not_found"
  | "own_content"
  | "invalid"
  | "rate_limited"
  | "unauthenticated";

export const reportOutcomes: readonly ReportOutcome[] = [
  "reported",
  "duplicate",
  "not_found",
  "own_content",
  "invalid",
  "rate_limited",
  "unauthenticated",
];

export interface ReportFormState {
  readonly notice?: string;
  readonly error?: string;
}

export function reportOutcomeState(outcome: ReportOutcome): ReportFormState {
  switch (outcome) {
    case "reported":
      return { notice: "Thanks. A moderator will review it, and you will be notified of the outcome." };
    case "duplicate":
      return { notice: "You have already reported this. A moderator will review it." };
    case "not_found":
      return { error: "This can no longer be reported. It may have been removed." };
    case "own_content":
      return { error: "You cannot report your own profile or content." };
    case "invalid":
      return { error: "Choose a reason. For 'Something else', describe the problem." };
    case "rate_limited":
      return { error: "You have sent many reports today. Try again tomorrow." };
    case "unauthenticated":
      return { error: "Your session expired. Sign in and try again." };
  }
}

export type ReportStatus = "pending" | "actioned" | "dismissed";

export type ReportResolution =
  | "no_violation"
  | "content_removed"
  | "user_suspended"
  | "removed_and_suspended";

export const reportStatusLabels: Record<ReportStatus, string> = {
  pending: "Under review",
  actioned: "Action taken",
  dismissed: "No violation",
};

/** What the reporter is told; a moderator's own message is shown as well. */
export const resolutionSummaries: Record<ReportResolution, string> = {
  no_violation: "A moderator reviewed it and found that no rule was broken.",
  content_removed: "A moderator removed the content you reported.",
  user_suspended: "A moderator suspended the account you reported.",
  removed_and_suspended: "A moderator removed the content and suspended the account.",
};

export function toReportStatus(value: string): ReportStatus {
  return value === "actioned" || value === "dismissed" ? value : "pending";
}

export function toReportResolution(value: string | null): ReportResolution | null {
  return value === "no_violation" ||
    value === "content_removed" ||
    value === "user_suspended" ||
    value === "removed_and_suspended"
    ? value
    : null;
}

/** One of the student's own reports, for the My reports page. */
export interface MyReport {
  readonly id: number;
  readonly targetType: ReportTargetType;
  readonly targetLabel: string;
  readonly reason: string;
  readonly details: string | null;
  readonly status: ReportStatus;
  readonly resolution: ReportResolution | null;
  readonly moderatorMessage: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

export const myReportsPath = "/reports";

// Administrators -----------------------------------------------------------------

export const adminReportReviewPath = "/admin/report-review";

export const reportDecisions = [
  "no_violation",
  "remove_content",
  "suspend_user",
  "remove_and_suspend",
] as const;

export type ReportDecision = (typeof reportDecisions)[number];

export const reportDecisionLabels: Record<ReportDecision, string> = {
  no_violation: "No violation: dismiss",
  remove_content: "Remove the content",
  suspend_user: "Suspend the account",
  remove_and_suspend: "Remove the content and suspend the account",
};

export function isReportDecision(value: unknown): value is ReportDecision {
  return typeof value === "string" && (reportDecisions as readonly string[]).includes(value);
}

/** Decisions that make sense for a report: profiles have no content to remove. */
export function decisionsFor(
  targetType: ReportTargetType,
  reportedUser: { readonly role: string } | null,
): ReportDecision[] {
  const canSuspend = reportedUser !== null && reportedUser.role === "student";
  const canRemove = targetType !== "user";

  return reportDecisions.filter((decision) => {
    if (decision === "no_violation") return true;
    if (decision === "remove_content") return canRemove;
    if (decision === "suspend_user") return canSuspend;
    return canRemove && canSuspend;
  });
}

export function decisionSuspends(decision: ReportDecision): boolean {
  return decision === "suspend_user" || decision === "remove_and_suspend";
}

export const reportReviewStatuses = ["pending", "actioned", "dismissed", "all"] as const;
export type ReportReviewStatus = (typeof reportReviewStatuses)[number];

export const reportReviewStatusLabels: Record<ReportReviewStatus, string> = {
  pending: "Open",
  actioned: "Action taken",
  dismissed: "Dismissed",
  all: "All",
};

export interface ReportReviewFilters {
  readonly status: ReportReviewStatus;
  readonly targetType: ReportTargetType | "all";
  readonly page: number;
  /** The report open in the detail panel. */
  readonly reportId: number | null;
}

export interface AdminReportSummary {
  readonly id: number;
  readonly targetType: ReportTargetType;
  readonly targetLabel: string;
  readonly reason: string;
  readonly details: string | null;
  readonly status: ReportStatus;
  readonly resolution: ReportResolution | null;
  readonly reporterName: string;
  readonly reportedName: string | null;
  readonly reportedAccountStatus: string | null;
  /** Open reports about the same profile or content, this one included. */
  readonly openReportsOnTarget: number;
  readonly reviewerName: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

export interface ReportContextMessage {
  readonly senderName: string;
  readonly body: string;
  readonly attachmentName: string | null;
  readonly sentAt: string;
  readonly deleted: boolean;
}

/** What was reported, as it was when the report was sent. */
export type ReportEvidence =
  | {
      readonly kind: "user";
      readonly fullName: string;
      readonly username: string | null;
      readonly bio: string | null;
      readonly academicMajor: string | null;
      readonly yearOfStudy: number | null;
      readonly interests: readonly string[];
      /** Recent messages when the profile was reported from a chat. */
      readonly context: readonly ReportContextMessage[];
    }
  | {
      readonly kind: "chat_message";
      readonly senderName: string;
      readonly body: string;
      readonly attachmentName: string | null;
      readonly sentAt: string | null;
      readonly chatLabel: string;
      readonly context: readonly ReportContextMessage[];
    }
  | { readonly kind: "forum_thread"; readonly title: string; readonly content: string }
  | { readonly kind: "forum_comment"; readonly threadTitle: string; readonly content: string }
  | {
      readonly kind: "library_material";
      readonly title: string;
      readonly description: string;
      readonly subject: string;
    };

/** A reporter or author as moderators see them. */
export interface ReportPerson {
  readonly name: string;
  readonly username: string | null;
  /** Shown when there is no username, so two people with one name can be told apart. */
  readonly email: string | null;
}

/** "Aina binti Rahman (@aina)", or with the email when there is no username. */
export function reportPersonLabel(person: ReportPerson): string {
  const handle = person.username ? `@${person.username}` : person.email;

  return handle ? `${person.name} (${handle})` : person.name;
}

export interface AdminReportDetail {
  readonly id: number;
  readonly targetType: ReportTargetType;
  readonly targetLabel: string;
  readonly reason: string;
  readonly details: string | null;
  readonly evidence: ReportEvidence;
  readonly status: ReportStatus;
  readonly resolution: ReportResolution | null;
  readonly moderatorMessage: string | null;
  readonly internalNote: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly reviewerName: string | null;
  readonly reporter: ReportPerson | null;
  readonly reportedUser: (ReportPerson & {
    readonly id: string;
    readonly accountStatus: string;
    readonly role: string;
  }) | null;
  /** Whether the content still exists and its state now (visible, deleted, published...). */
  readonly current: { readonly exists: boolean; readonly state: string | null };
  readonly otherReports: readonly {
    readonly id: number;
    readonly reporterName: string;
    readonly reason: string;
    readonly details: string | null;
    readonly status: ReportStatus;
    readonly createdAt: string;
  }[];
}

export interface ReportReviewModel {
  readonly filters: ReportReviewFilters;
  readonly reports: readonly AdminReportSummary[];
  readonly total: number;
  readonly pageCount: number;
  readonly openCount: number;
  readonly selected: AdminReportDetail | null;
  readonly decisions: readonly ReportDecision[];
}

export interface ReportDecisionState {
  readonly notice?: string;
  readonly error?: string;
}

export type ResolveOutcome =
  | "resolved"
  | "not_found"
  | "already_resolved"
  | "invalid"
  | "not_applicable"
  | "not_suspended"
  | "reason_required";

export const resolveMessages: Record<Exclude<ResolveOutcome, "resolved">, string> = {
  not_found: "That report no longer exists.",
  already_resolved: "Another moderator has already decided this report.",
  invalid: "This decision could not be understood.",
  not_applicable: "That decision does not apply to this report.",
  not_suspended: "The account could not be suspended, so nothing was recorded.",
  reason_required: "Give a reason. It is kept in the audit log.",
};

export const reportReviewPageSize = 25;

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseReportReviewFilters(params: {
  readonly status?: SearchParamValue;
  readonly type?: SearchParamValue;
  readonly page?: SearchParamValue;
  readonly report?: SearchParamValue;
}): ReportReviewFilters {
  const status = firstValue(params.status);
  const type = firstValue(params.type);
  const page = Number(firstValue(params.page));
  const reportId = Number(firstValue(params.report));

  return {
    status: (reportReviewStatuses as readonly string[]).includes(status)
      ? (status as ReportReviewStatus)
      : "pending",
    targetType: isReportTargetType(type) ? type : "all",
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
    reportId: Number.isSafeInteger(reportId) && reportId > 0 ? reportId : null,
  };
}

export function reportReviewHref(
  filters: ReportReviewFilters,
  changes: Partial<ReportReviewFilters> = {},
): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();

  if (next.status !== "pending") params.set("status", next.status);
  if (next.targetType !== "all") params.set("type", next.targetType);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.reportId !== null) params.set("report", String(next.reportId));

  const query = params.toString();

  return query ? `${adminReportReviewPath}?${query}` : adminReportReviewPath;
}
