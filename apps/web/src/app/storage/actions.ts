"use server";

import { revalidatePath } from "next/cache";

import {
  createProfileController,
  createStorageRequestController,
} from "@/lib/dependencies/server";
import type { StorageRequestFormState } from "@/models/storage/storage-request.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function refresh() {
  revalidatePath("/storage");
  revalidatePath("/profile");
  revalidatePath("/admin/storage-requests");
  revalidatePath("/admin");
}

export async function requestStorageAction(
  _previous: StorageRequestFormState,
  formData: FormData,
): Promise<StorageRequestFormState> {
  if (!(await (await createProfileController()).currentViewer())) {
    return { error: "Your session expired. Sign in and try again." };
  }

  const state = await (await createStorageRequestController()).request(
    field(formData, "additionalBytes"),
    field(formData, "reason"),
  );

  if (state.notice) refresh();

  return state;
}

export async function cancelStorageRequestAction(
  _previous: StorageRequestFormState,
  formData: FormData,
): Promise<StorageRequestFormState> {
  const requestId = Number(field(formData, "requestId"));

  if (!Number.isSafeInteger(requestId) || requestId <= 0) {
    return { error: "This request could not be found." };
  }

  const state = await (await createStorageRequestController()).cancel(requestId);

  if (state.notice) refresh();

  return state;
}
