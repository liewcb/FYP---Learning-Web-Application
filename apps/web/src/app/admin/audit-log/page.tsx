import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  createAdminController,
  createAuditLogController,
} from "@/lib/dependencies/server";
import { parseAuditLogFilters } from "@/models/admin/audit-log.model";
import { AdminAuditLogView } from "@/views/admin/admin-audit-log.view";

export const metadata: Metadata = {
  title: "Audit log · Admin",
};

interface AdminAuditLogPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminAuditLogPage({ searchParams }: AdminAuditLogPageProps) {
  const access = await (await createAdminController()).access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  const filters = parseAuditLogFilters(await searchParams);
  const model = await (await createAuditLogController()).load(filters);

  return <AdminAuditLogView model={model} />;
}
