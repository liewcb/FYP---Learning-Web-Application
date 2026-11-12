import type { MyReport, ReportOutcome, SubmitReportInput } from "@/models/reports/report.model";

/** Reports sent by the signed-in student. */
export interface ReportRepository {
  submit(input: SubmitReportInput): Promise<ReportOutcome>;
  /** The student's own reports, newest first. */
  listMine(limit: number): Promise<MyReport[]>;
}
