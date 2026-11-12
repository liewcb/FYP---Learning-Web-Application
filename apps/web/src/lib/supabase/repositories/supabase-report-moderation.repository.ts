import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReportModerationRepository } from "@/interfaces/repositories/report-moderation.repository";
import {
  isReportTargetType,
  toReportResolution,
  toReportStatus,
  type AdminReportDetail,
  type AdminReportSummary,
  type ReportContextMessage,
  type ReportDecision,
  type ReportEvidence,
  type ReportReviewFilters,
  type ReportTargetType,
  type ResolveOutcome,
} from "@/models/reports/report.model";

interface SummaryRow {
  id: number;
  target_type: string;
  target_label: string;
  reason: string;
  details: string | null;
  status: string;
  resolution: string | null;
  reporter_name: string | null;
  reported_name: string | null;
  reported_account_status: string | null;
  open_reports_on_target: number;
  reviewer_name: string | null;
  created_at: string;
  reviewed_at: string | null;
  total_count: number;
}

type Json = Record<string, unknown>;

const resolveOutcomes = new Set<ResolveOutcome>([
  "resolved",
  "not_found",
  "already_resolved",
  "invalid",
  "not_applicable",
  "not_suspended",
  "reason_required",
]);

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function object(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

function context(value: unknown): ReportContextMessage[] {
  return (Array.isArray(value) ? value : []).map((item) => {
    const row = object(item);

    return {
      senderName: text(row.sender_name, "A student"),
      body: text(row.body),
      attachmentName: nullableText(row.attachment_name),
      sentAt: text(row.sent_at),
      deleted: row.deleted === true,
    };
  });
}

/** The snapshot taken when the report was sent, by what was reported. */
function evidence(type: ReportTargetType, snapshot: Json): ReportEvidence {
  switch (type) {
    case "user":
      return {
        kind: "user",
        fullName: text(snapshot.full_name, "A student"),
        username: nullableText(snapshot.username),
        bio: nullableText(snapshot.bio),
        academicMajor: nullableText(snapshot.academic_major),
        yearOfStudy: typeof snapshot.year_of_study === "number" ? snapshot.year_of_study : null,
        interests: Array.isArray(snapshot.interests) ? snapshot.interests.filter((i) => typeof i === "string") : [],
        context: context(snapshot.context),
      };
    case "chat_message":
      return {
        kind: "chat_message",
        senderName: text(snapshot.sender_name, "A student"),
        body: text(snapshot.body),
        attachmentName: nullableText(snapshot.attachment_name),
        sentAt: nullableText(snapshot.sent_at),
        chatLabel: snapshot.chat === "group" ? `Group chat "${text(snapshot.group_title, "Group")}"` : "Direct chat",
        context: context(snapshot.context),
      };
    case "forum_thread":
      return { kind: "forum_thread", title: text(snapshot.title), content: text(snapshot.content) };
    case "forum_comment":
      return {
        kind: "forum_comment",
        threadTitle: text(snapshot.thread_title),
        content: text(snapshot.content),
      };
    case "library_material":
      return {
        kind: "library_material",
        title: text(snapshot.title),
        description: text(snapshot.description),
        subject: [text(snapshot.subject_name), text(snapshot.module_code)].filter(Boolean).join(" · "),
      };
  }
}

/** Table-returning functions come back as an array with one row. */
function firstRow<T>(data: unknown): T | null {
  return Array.isArray(data) ? ((data[0] as T | undefined) ?? null) : null;
}

export class SupabaseReportModerationRepository implements ReportModerationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(
    filters: Pick<ReportReviewFilters, "status" | "targetType">,
    limit: number,
    offset: number,
  ): Promise<{ readonly reports: AdminReportSummary[]; readonly total: number }> {
    const { data, error } = await this.supabase.rpc("admin_list_reports", {
      p_status: filters.status,
      p_target_type: filters.targetType,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      throw new Error(`Unable to load reports: ${error.message}`);
    }

    const rows = data as SummaryRow[];

    return {
      total: rows[0] ? Number(rows[0].total_count) : 0,
      reports: rows.flatMap((row) =>
        isReportTargetType(row.target_type)
          ? [
              {
                id: row.id,
                targetType: row.target_type,
                targetLabel: row.target_label,
                reason: row.reason,
                details: row.details,
                status: toReportStatus(row.status),
                resolution: toReportResolution(row.resolution),
                reporterName: row.reporter_name ?? "A student",
                reportedName: row.reported_name,
                reportedAccountStatus: row.reported_account_status,
                openReportsOnTarget: Number(row.open_reports_on_target),
                reviewerName: row.reviewer_name,
                createdAt: row.created_at,
                reviewedAt: row.reviewed_at,
              },
            ]
          : [],
      ),
    };
  }

  async find(reportId: number): Promise<AdminReportDetail | null> {
    const { data, error } = await this.supabase.rpc("admin_get_report", { p_report: reportId });

    if (error) {
      throw new Error(`Unable to load report: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const row = object(data);

    if (!isReportTargetType(row.target_type)) {
      return null;
    }

    const reporter = object(row.reporter);
    const reported = object(row.reported_user);
    const current = object(row.current);

    return {
      id: Number(row.id),
      targetType: row.target_type,
      targetLabel: text(row.target_label),
      reason: text(row.reason),
      details: nullableText(row.details),
      evidence: evidence(row.target_type, object(row.snapshot)),
      status: toReportStatus(text(row.status)),
      resolution: toReportResolution(nullableText(row.resolution)),
      moderatorMessage: nullableText(row.reporter_message),
      internalNote: nullableText(row.internal_note),
      createdAt: text(row.created_at),
      reviewedAt: nullableText(row.reviewed_at),
      reviewerName: nullableText(row.reviewer_name),
      reporter: row.reporter
        ? {
            name: text(reporter.name, "A student"),
            username: nullableText(reporter.username),
            email: nullableText(reporter.email),
          }
        : null,
      reportedUser: row.reported_user
        ? {
            id: text(reported.id),
            name: text(reported.name, "A student"),
            username: nullableText(reported.username),
            email: nullableText(reported.email),
            accountStatus: text(reported.account_status, "active"),
            role: text(reported.role, "student"),
          }
        : null,
      current: { exists: current.exists === true, state: nullableText(current.state) },
      otherReports: (Array.isArray(row.other_reports) ? row.other_reports : []).map((item) => {
        const other = object(item);

        return {
          id: Number(other.id),
          reporterName: text(other.reporter_name, "A student"),
          reason: text(other.reason),
          details: nullableText(other.details),
          status: toReportStatus(text(other.status)),
          createdAt: text(other.created_at),
        };
      }),
    };
  }

  async resolve(input: {
    readonly reportId: number;
    readonly decision: ReportDecision;
    readonly reporterMessage: string | null;
    readonly note: string | null;
  }): Promise<{
    readonly outcome: ResolveOutcome;
    readonly closedReports: number;
    readonly removedPath: string | null;
  }> {
    const { data, error } = await this.supabase.rpc("admin_resolve_report", {
      p_report: input.reportId,
      p_decision: input.decision,
      p_reporter_message: input.reporterMessage,
      p_note: input.note,
    });

    if (error) {
      throw new Error(`Unable to record the decision: ${error.message}`);
    }

    const row = firstRow<{ outcome: unknown; closed_reports: number | null; removed_path: string | null }>(data);

    if (!resolveOutcomes.has(row?.outcome as ResolveOutcome)) {
      throw new Error(`Unexpected decision result: ${String(row?.outcome)}`);
    }

    return {
      outcome: row!.outcome as ResolveOutcome,
      closedReports: Number(row!.closed_reports ?? 0),
      removedPath: row!.removed_path,
    };
  }
}
