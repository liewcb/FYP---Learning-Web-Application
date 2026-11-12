"use server";

import { revalidatePath } from "next/cache";

import {
  createAdminController,
  createReportReviewController,
} from "@/lib/dependencies/server";
import {
  adminReportReviewPath,
  isReportDecision,
  type ReportDecisionState,
} from "@/models/reports/report.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

/** Records a moderator's decision on a report and notifies the reporters. */
export async function decideReportAction(
  _previous: ReportDecisionState,
  formData: FormData,
): Promise<ReportDecisionState> {
  if ((await (await createAdminController()).access()).status !== "allowed") {
    return { error: "You do not have permission to review reports." };
  }

  const reportId = Number(field(formData, "reportId"));
  const decision = field(formData, "decision");

  if (!Number.isSafeInteger(reportId) || reportId <= 0) {
    return { error: "This report could not be found." };
  }

  if (!isReportDecision(decision)) {
    return { error: "Choose a decision." };
  }

  const state = await (await createReportReviewController()).decide({
    reportId,
    decision,
    reporterMessage: field(formData, "reporterMessage"),
    note: field(formData, "note"),
  });

  if (state.notice) {
    for (const path of [adminReportReviewPath, "/admin", "/admin/audit-log", "/admin/users", "/admin/forum", "/forum", "/library"]) {
      revalidatePath(path);
    }
  }

  return state;
}
