import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  changeAccountStatusAction,
  setStorageQuotaAction,
} from "@/app/admin/users/actions";
import {
  createAdminController,
  createAdminUsersController,
} from "@/lib/dependencies/server";
import { parseAdminUserFilters } from "@/models/admin/admin-users.model";
import { AdminUsersView } from "@/views/admin/admin-users.view";

export const metadata: Metadata = {
  title: "User management · Admin",
};

interface AdminUsersPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const access = await (await createAdminController()).access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  const filters = parseAdminUserFilters(await searchParams);
  const model = await (await createAdminUsersController()).load(filters, access.viewer.id);

  return (
    <AdminUsersView
      model={model}
      statusAction={changeAccountStatusAction}
      quotaAction={setStorageQuotaAction}
    />
  );
}
