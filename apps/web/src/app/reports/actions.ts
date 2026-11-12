"use server";

import { revalidatePath } from "next/cache";

import { createProfileController, createReportController } from "@/lib/dependencies/server";
import { myReportsPath, type ReportFormState } from "@/models/reports/report.model";

export interface ReportActionInput {
  readonly targetType: string;
  readonly targetId?: number | null;
  readonly targetUserId?: string | null;
  readonly reason: string;
  readonly details: string;
}

/** Sends a report about a profile, a chat message, a forum post or a library material. */
export async function submitReportAction(input: ReportActionInput): Promise<ReportFormState> {
  // Server Actions are public entry points, so check the account.
  const viewer = await (await createProfileController()).currentViewer();

  if (viewer?.role !== "student") {
    return { error: "Your session expired. Sign in and try again." };
  }

  const state = await (await createReportController()).submit({
    targetType: input?.targetType,
    targetId: input?.targetId,
    targetUserId: input?.targetUserId,
    reason: input?.reason,
    details: input?.details,
  });

  if (state.notice) {
    revalidatePath(myReportsPath);
  }

  return state;
}
