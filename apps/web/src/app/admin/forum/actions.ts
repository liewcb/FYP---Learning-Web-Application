"use server";

import { revalidatePath } from "next/cache";

import {
  createAdminController,
  createForumModerationController,
} from "@/lib/dependencies/server";
import {
  isModerationAction,
  isModerationKind,
  type ModerationActionState,
} from "@/models/admin/forum-moderation.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function positiveId(formData: FormData, name: string): number | null {
  const value = Number(field(formData, name));

  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function allowed(): Promise<boolean> {
  return (await (await createAdminController()).access()).status === "allowed";
}

function refresh() {
  revalidatePath("/admin/forum");
  revalidatePath("/admin/audit-log");
  revalidatePath("/admin");
  revalidatePath("/forum");
}

export async function moderateForumContentAction(
  _previous: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  if (!(await allowed())) {
    return { error: "You do not have permission to moderate the forum." };
  }

  const kind = field(formData, "kind");
  const action = field(formData, "action");
  const id = positiveId(formData, "id");

  if (!isModerationKind(kind) || !isModerationAction(action) || id === null) {
    return { error: "This moderation action could not be understood." };
  }

  const state = await (await createForumModerationController()).moderate(
    kind,
    id,
    action,
    field(formData, "reason"),
  );

  if (state.notice) refresh();

  return state;
}

export async function dismissForumReportAction(
  _previous: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  if (!(await allowed())) {
    return { error: "You do not have permission to moderate the forum." };
  }

  const reportId = positiveId(formData, "reportId");

  if (reportId === null) {
    return { error: "This report could not be found." };
  }

  const state = await (await createForumModerationController()).dismissReport(
    reportId,
    field(formData, "reason"),
  );

  if (state.notice) refresh();

  return state;
}
