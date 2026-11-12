import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { decideStorageRequestAction } from "@/app/admin/storage-requests/actions";
import {
  createAdminController,
  createStorageRequestController,
} from "@/lib/dependencies/server";
import { parseAdminStorageRequestFilter } from "@/models/storage/storage-request.model";
import { AdminStorageRequestsView } from "@/views/admin/admin-storage-requests.view";

export const metadata: Metadata = {
  title: "Storage requests · Admin",
};

interface AdminStorageRequestsPageProps {
  readonly searchParams: Promise<{ status?: string | string[] }>;
}

export default async function AdminStorageRequestsPage({ searchParams }: AdminStorageRequestsPageProps) {
  const access = await (await createAdminController()).access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  const filter = parseAdminStorageRequestFilter((await searchParams).status);
  const model = await (await createStorageRequestController()).reviewQueue(filter);

  return <AdminStorageRequestsView model={model} decideAction={decideStorageRequestAction} />;
}
