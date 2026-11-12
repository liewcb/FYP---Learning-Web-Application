import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReportRepository } from "@/interfaces/repositories/report.repository";
import {
  isReportTargetType,
  reportOutcomes,
  toReportResolution,
  toReportStatus,
  type MyReport,
  type ReportOutcome,
  type SubmitReportInput,
} from "@/models/reports/report.model";

interface MyReportRow {
  id: number;
  target_type: string;
  target_label: string;
  reason: string;
  details: string | null;
  status: string;
  resolution: string | null;
  reporter_message: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/** Table-returning functions come back as an array with one row. */
function firstRow<T>(data: unknown): T | null {
  return Array.isArray(data) ? ((data[0] as T | undefined) ?? null) : null;
}

export class SupabaseReportRepository implements ReportRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async submit(input: SubmitReportInput): Promise<ReportOutcome> {
    const { data, error } = await this.supabase.rpc("submit_report", {
      p_target_type: input.target.type,
      p_target_id: input.target.type === "user" ? null : input.target.id,
      p_target_user: input.target.type === "user" ? input.target.userId : null,
      p_reason: input.reason,
      p_details: input.details,
    });

    if (error) {
      throw new Error(`Unable to send report: ${error.message}`);
    }

    const outcome = firstRow<{ outcome: unknown }>(data)?.outcome;

    if (!reportOutcomes.includes(outcome as ReportOutcome)) {
      throw new Error(`Unexpected report result: ${String(outcome)}`);
    }

    return outcome as ReportOutcome;
  }

  async listMine(limit: number): Promise<MyReport[]> {
    // Row-level security returns only the signed-in student's reports.
    const { data, error } = await this.supabase
      .from("reports")
      .select("id, target_type, target_label, reason, details, status, resolution, reporter_message, created_at, reviewed_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Unable to load your reports: ${error.message}`);
    }

    return (data as MyReportRow[]).flatMap((row) =>
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
              moderatorMessage: row.reporter_message,
              createdAt: row.created_at,
              reviewedAt: row.reviewed_at,
            },
          ]
        : [],
    );
  }
}
