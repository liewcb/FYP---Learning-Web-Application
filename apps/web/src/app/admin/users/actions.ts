"use server";

import { revalidatePath } from "next/cache";

import {
  createAdminController,
  createAdminUsersController,
} from "@/lib/dependencies/server";
import type { AdminUserActionState } from "@/models/admin/admin-users.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

async function allowed(): Promise<boolean> {
  // Every admin action checks access itself; layouts are not enough.
  return (await (await createAdminController()).access()).status === "allowed";
}

function refresh() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/audit-log");
  revalidatePath("/admin");
}

export async function changeAccountStatusAction(
  _previous: AdminUserActionState,
  formData: FormData,
): Promise<AdminUserActionState> {
  if (!(await allowed())) {
    return { error: "You do not have permission to manage accounts." };
  }

  const users = await createAdminUsersController();
  const userId = field(formData, "userId");
  const state =
    field(formData, "intent") === "reactivate"
      ? await users.reactivate(userId)
      : await users.suspend(userId, field(formData, "reason"));

  if (state.notice) refresh();

  return state;
}

export async function setStorageQuotaAction(
  _previous: AdminUserActionState,
  formData: FormData,
): Promise<AdminUserActionState> {
  if (!(await allowed())) {
    return { error: "You do not have permission to manage accounts." };
  }

  const state = await (await createAdminUsersController()).setStorageQuota(
    field(formData, "userId"),
    field(formData, "quotaBytes"),
  );

  if (state.notice) refresh();

  return state;
}
