import {
  bucketLabels,
  formatStorage,
  percentOf,
  type MonitoringModel,
} from "@/models/admin/system-monitoring.model";

export const adminReportsPath = "/admin/reports";

/** Report sections an administrator can include (use case step 5). */
export const reportSections = ["storage", "activity", "sessions", "status", "administration"] as const;
export type ReportSection = (typeof reportSections)[number];

export const reportSectionLabels: Record<ReportSection, string> = {
  storage: "Storage utilisation",
  activity: "User activities",
  sessions: "Active user sessions",
  status: "System status",
  administration: "Moderation & administration",
};

export const reportSectionDescriptions: Record<ReportSection, string> = {
  storage: "Platform storage, storage by area and the students using the most space.",
  activity: "New and active users, learning activity per day and the most active students.",
  sessions: "Who is online now, active sessions and sign-ins during the period.",
  status: "Health of the web app, database, AI service, file storage and sign-in.",
  administration: "Moderation decisions, library reviews and storage requests.",
};

export const reportPeriods = [7, 30, 90] as const;
export type ReportPeriod = (typeof reportPeriods)[number];

/** The use case's confirmation message (M1). */
export const reportGeneratedNotice = "System report generated successfully";

export interface ReportRequest {
  readonly sections: readonly ReportSection[];
  readonly days: ReportPeriod;
}

export interface ReportDay {
  readonly day: string;
  readonly newUsers: number;
  readonly uploads: number;
  readonly quizAttempts: number;
  readonly forumPosts: number;
}

export interface ReportStudent {
  readonly name: string;
  readonly username: string | null;
  readonly uploads: number;
  readonly quizAttempts: number;
  readonly forumPosts: number;
  readonly librarySubmissions: number;
  readonly total: number;
}

/** Figures for the chosen period, from admin_report_activity(). */
export interface ReportActivity {
  readonly days: number;
  readonly from: string;
  readonly to: string;
  readonly users: {
    readonly total: number;
    readonly students: number;
    readonly new: number;
    readonly active: number;
    readonly signedIn: number | null;
    readonly suspendedNow: number;
  };
  readonly sessionsStarted: number | null;
  readonly learning: {
    readonly documentsUploaded: number;
    readonly bytesUploaded: number;
    readonly documentsFailed: number;
    readonly analysesReady: number;
    readonly analysesFailed: number;
    readonly quizzesReady: number;
    readonly quizzesFailed: number;
    readonly quizAttempts: number;
    readonly averageScore: number | null;
    readonly forumThreads: number;
    readonly forumComments: number;
    readonly librarySubmissions: number;
    readonly libraryPublished: number;
  };
  readonly daily: readonly ReportDay[];
  readonly topStudents: readonly ReportStudent[];
  readonly administration: {
    readonly actions: Readonly<Record<string, number>>;
    readonly storageRequests: {
      readonly submitted: number;
      readonly approved: number;
      readonly rejected: number;
      readonly pending: number;
      readonly bytesGranted: number;
    };
    readonly reports: { readonly submitted: number; readonly resolved: number; readonly pending: number } | null;
  };
}

export interface SystemReport {
  readonly request: ReportRequest;
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly monitoring: MonitoringModel;
  readonly activity: ReportActivity;
}

type SearchParamValue = string | string[] | undefined;

function values(value: SearchParamValue): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

/** Reads ?sections=...&days=...; an empty selection means every section. */
export function parseReportRequest(params: {
  readonly sections?: SearchParamValue;
  readonly days?: SearchParamValue;
}): ReportRequest {
  const chosen = values(params.sections).flatMap((value) => value.split(","));
  const sections = reportSections.filter((section) => chosen.includes(section));
  const days = Number(values(params.days)[0]);

  return {
    sections: sections.length > 0 ? sections : [...reportSections],
    days: (reportPeriods as readonly number[]).includes(days) ? (days as ReportPeriod) : 30,
  };
}

export function reportQuery(request: ReportRequest): string {
  const params = new URLSearchParams();

  for (const section of request.sections) params.append("sections", section);
  params.set("days", String(request.days));

  return params.toString();
}

/** Readable names for audit actions in the administration section. */
export const reportActionLabels: Record<string, string> = {
  user_suspended: "Accounts suspended",
  user_reactivated: "Accounts reactivated",
  user_storage_quota_changed: "Storage quotas changed",
  storage_request_approved: "Storage requests approved",
  storage_request_rejected: "Storage requests rejected",
  forum_thread_hidden: "Forum threads hidden",
  forum_thread_deleted: "Forum threads removed",
  forum_thread_restored: "Forum threads restored",
  forum_comment_hidden: "Forum comments hidden",
  forum_comment_deleted: "Forum comments removed",
  forum_comment_restored: "Forum comments restored",
  library_material_submitted: "Library submissions",
  library_material_approved: "Library materials approved",
  library_material_rejected: "Library materials rejected",
  library_material_archived: "Library materials archived",
  system_report_generated: "System reports generated",
};

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);

  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Flat CSV (section, item, value) so it opens cleanly in Excel. */
export function reportToCsv(report: SystemReport): string {
  const rows: (string | number | null)[][] = [["Section", "Item", "Value"]];
  const { monitoring, activity, request } = report;
  const add = (section: string, item: string, value: string | number | null) =>
    rows.push([section, item, value]);
  const overview = monitoring.overview;

  add("Report", "Generated at", report.generatedAt);
  add("Report", "Generated by", report.generatedBy);
  add("Report", "Period", `Last ${activity.days} days (${activity.from.slice(0, 10)} to ${activity.to.slice(0, 10)})`);

  if (request.sections.includes("storage")) {
    add("Storage", "Platform storage used", formatStorage(monitoring.platformBytes));
    add("Storage", "Platform capacity", formatStorage(monitoring.platformCapacityBytes));
    add("Storage", "Percent used", `${percentOf(monitoring.platformBytes, monitoring.platformCapacityBytes)}%`);
    for (const bucket of overview.storage.buckets ?? []) {
      add("Storage", `${bucketLabels[bucket.bucket] ?? bucket.bucket} (${bucket.objects} files)`, formatStorage(bucket.bytes));
    }
    add("Storage", "Students above 80% of quota", overview.storage.usersOver80Percent);
    for (const user of monitoring.heaviestUsers) {
      add("Storage by student", user.name, `${formatStorage(user.usedBytes)} of ${formatStorage(user.quotaBytes)}`);
    }
    add("Storage", "Uploaded in period", formatStorage(activity.learning.bytesUploaded));
  }

  if (request.sections.includes("activity")) {
    add("User activities", "Registered users", activity.users.total);
    add("User activities", "New users in period", activity.users.new);
    add("User activities", "Active users in period", activity.users.active);
    add("User activities", "Documents uploaded", activity.learning.documentsUploaded);
    add("User activities", "Content analyses", activity.learning.analysesReady);
    add("User activities", "Quizzes generated", activity.learning.quizzesReady);
    add("User activities", "Quiz attempts", activity.learning.quizAttempts);
    add("User activities", "Average quiz score", activity.learning.averageScore === null ? null : `${activity.learning.averageScore}%`);
    add("User activities", "Forum threads", activity.learning.forumThreads);
    add("User activities", "Forum comments", activity.learning.forumComments);
    add("User activities", "Library submissions", activity.learning.librarySubmissions);
    for (const day of activity.daily) {
      add("Daily activity", day.day, `${day.newUsers} new users; ${day.uploads} uploads; ${day.quizAttempts} quiz attempts; ${day.forumPosts} forum posts`);
    }
    for (const student of activity.topStudents) {
      add("Most active students", student.name, `${student.uploads} uploads; ${student.quizAttempts} quiz attempts; ${student.forumPosts} forum posts; ${student.librarySubmissions} library submissions`);
    }
  }

  if (request.sections.includes("sessions")) {
    add("Sessions", "Online now (15 min)", overview.users.seenLast15Minutes);
    add("Sessions", "Active today", overview.users.seenLast24Hours);
    add("Sessions", "Active sessions now", overview.sessions?.active ?? null);
    add("Sessions", "Users signed in now", overview.sessions?.usersWithSessions ?? null);
    add("Sessions", "Sessions started in period", activity.sessionsStarted);
    add("Sessions", "Users who signed in during period", activity.users.signedIn);
  }

  if (request.sections.includes("status")) {
    for (const service of monitoring.services) {
      add("System status", service.name, `${service.state}: ${service.detail}`);
    }
    add("System status", "Failed document extractions in period", activity.learning.documentsFailed);
    add("System status", "Failed analyses in period", activity.learning.analysesFailed);
    add("System status", "Failed quiz generations in period", activity.learning.quizzesFailed);
    for (const alert of monitoring.alerts) {
      add("Alerts", alert.title, alert.detail);
    }
  }

  if (request.sections.includes("administration")) {
    const { storageRequests, reports, actions } = activity.administration;
    add("Administration", "Storage requests submitted", storageRequests.submitted);
    add("Administration", "Storage requests approved", storageRequests.approved);
    add("Administration", "Storage requests rejected", storageRequests.rejected);
    add("Administration", "Storage granted", formatStorage(storageRequests.bytesGranted));
    if (reports) {
      add("Administration", "Reports submitted", reports.submitted);
      add("Administration", "Reports resolved", reports.resolved);
      add("Administration", "Reports still pending", reports.pending);
    }
    for (const [action, total] of Object.entries(actions)) {
      add("Administrative actions", reportActionLabels[action] ?? action.replace(/_/g, " "), total);
    }
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
