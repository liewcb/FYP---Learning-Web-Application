"use server";

import { revalidatePath } from "next/cache";

import {
  createAdminController,
  createStorageRequestController,
} from "@/lib/dependencies/server";
import type { StorageRequestFormState } from "@/models/storage/storage-request.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function decideStorageRequestAction(
  _previous: StorageRequestFormState,
  formData: FormData,
): Promise<StorageRequestFormState> {
  // Every admin action checks access itself; layouts are not enough.
  if ((await (await createAdminController()).access()).status !== "allowed") {
    return { error: "You do not have permission to review storage requests." };
  }

  const requestId = Number(field(formData, "requestId"));
  const decision = field(formData, "decision");

  if (!Number.isSafeInteger(requestId) || requestId <= 0 || (decision !== "approve" && decision !== "reject")) {
    return { error: "This decision could not be understood." };
  }

  const state = await (await createStorageRequestController()).decide(
    requestId,
    decision === "approve",
    field(formData, "note"),
  );

  if (state.notice) {
    revalidatePath("/admin/storage-requests");
    revalidatePath("/admin/users");
    revalidatePath("/admin/audit-log");
    revalidatePath("/admin");
    revalidatePath("/storage");
  }

  return state;
}
