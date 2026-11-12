import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { decideReportAction } from "@/app/admin/report-review/actions";
import {
  createAdminController,
  createReportReviewController,
} from "@/lib/dependencies/server";
import { parseReportReviewFilters } from "@/models/reports/report.model";
import { AdminReportReviewView } from "@/views/admin/admin-report-review.view";

export const metadata: Metadata = {
  title: "Report review · Admin",
};

interface AdminReportReviewPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminReportReviewPage({ searchParams }: AdminReportReviewPageProps) {
  const access = await (await createAdminController()).access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  const filters = parseReportReviewFilters(await searchParams);
  const model = await (await createReportReviewController()).load(filters);

  return <AdminReportReviewView model={model} decideAction={decideReportAction} />;
}
