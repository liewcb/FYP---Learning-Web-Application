import type { NextRequest } from "next/server";

import {
  createAdminController,
  createSystemReportController,
} from "@/lib/dependencies/server";
import { parseReportRequest, reportToCsv } from "@/models/admin/system-report.model";

export async function GET(request: NextRequest) {
  const access = await (await createAdminController()).access();

  if (access.status === "denied") {
    return new Response("Not allowed.", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const reportRequest = parseReportRequest({
    sections: params.getAll("sections"),
    days: params.get("days") ?? undefined,
  });
  // The on-screen report already recorded the generation in the audit log.
  const report = await (await createSystemReportController()).generate(reportRequest, access.viewer, false);
  const fileName = `athenix-system-report-${report.generatedAt.slice(0, 10)}-${reportRequest.days}d.csv`;

  // A byte-order mark lets Excel open the file as UTF-8.
  return new Response(`﻿${reportToCsv(report)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
