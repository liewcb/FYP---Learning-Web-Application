import type { ReportActivity } from "@/models/admin/system-report.model";

export interface SystemReportRepository {
  /** Period figures; `record` writes the generation to the audit log. */
  activity(days: number, record: boolean): Promise<ReportActivity>;
}
