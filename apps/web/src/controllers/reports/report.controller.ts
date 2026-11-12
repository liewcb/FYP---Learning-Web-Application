import type { ReportRepository } from "@/interfaces/repositories/report.repository";
import {
  isReportReason,
  isReportTargetType,
  reportOutcomeState,
  reportRules,
  type MyReport,
  type ReportFormState,
  type ReportTarget,
} from "@/models/reports/report.model";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const myReportsLimit = 100;

/** Raw values from a report form. */
export interface ReportFormInput {
  readonly targetType: unknown;
  readonly targetId: unknown;
  readonly targetUserId: unknown;
  readonly reason: unknown;
  readonly details: unknown;
}

function parseTarget(input: ReportFormInput): ReportTarget | null {
  if (!isReportTargetType(input.targetType)) {
    return null;
  }

  if (input.targetType === "user") {
    return typeof input.targetUserId === "string" && uuidPattern.test(input.targetUserId)
      ? { type: "user", userId: input.targetUserId }
      : null;
  }

  const id = Number(input.targetId);

  return Number.isSafeInteger(id) && id > 0 ? { type: input.targetType, id } : null;
}

/** Students report profiles, messages, posts and materials. */
export class ReportController {
  constructor(private readonly reports: ReportRepository) {}

  async submit(input: ReportFormInput): Promise<ReportFormState> {
    const target = parseTarget(input);
    const details = typeof input.details === "string" ? input.details.trim() : "";

    if (!target) {
      return { error: "This can no longer be reported. It may have been removed." };
    }

    if (!isReportReason(input.reason)) {
      return { error: "Choose a reason for the report." };
    }

    if (details.length > reportRules.detailsMax) {
      return { error: `Keep the details under ${reportRules.detailsMax} characters.` };
    }

    if (input.reason === "other" && !details) {
      return { error: "Describe the problem so a moderator knows what to look for." };
    }

    try {
      const outcome = await this.reports.submit({
        target,
        reason: input.reason,
        details: details || null,
      });

      return reportOutcomeState(outcome);
    } catch (error) {
      console.error("Report failed.", error);
      return { error: "The report could not be sent. Please try again." };
    }
  }

  async listMine(): Promise<MyReport[]> {
    return this.reports.listMine(myReportsLimit);
  }
}
