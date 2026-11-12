import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  createAdminController,
  createSystemReportController,
} from "@/lib/dependencies/server";
import { parseReportRequest } from "@/models/admin/system-report.model";
import { AdminReportsView } from "@/views/admin/admin-reports.view";

export const metadata: Metadata = {
  title: "Reports · Admin",
};

interface AdminReportsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminReportsPage({ searchParams }: AdminReportsPageProps) {
  const access = await (await createAdminController()).access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  const params = await searchParams;
  const request = parseReportRequest(params);
  const report =
    params.generate === "1"
      ? await (await createSystemReportController()).generate(request, access.viewer, true)
      : null;

  return <AdminReportsView request={request} report={report} />;
}
