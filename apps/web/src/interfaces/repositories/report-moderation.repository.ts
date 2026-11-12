import type {
  AdminReportDetail,
  AdminReportSummary,
  ReportDecision,
  ReportReviewFilters,
  ResolveOutcome,
} from "@/models/reports/report.model";

/** Every student's reports, for administrators. */
export interface ReportModerationRepository {
  list(
    filters: Pick<ReportReviewFilters, "status" | "targetType">,
    limit: number,
    offset: number,
  ): Promise<{ readonly reports: AdminReportSummary[]; readonly total: number }>;
  find(reportId: number): Promise<AdminReportDetail | null>;
  /** Records the decision, closes the related reports and notifies the reporters. */
  resolve(input: {
    readonly reportId: number;
    readonly decision: ReportDecision;
    readonly reporterMessage: string | null;
    readonly note: string | null;
  }): Promise<{
    readonly outcome: ResolveOutcome;
    readonly closedReports: number;
    /** A removed chat attachment whose file should be deleted. */
    readonly removedPath: string | null;
  }>;
}
