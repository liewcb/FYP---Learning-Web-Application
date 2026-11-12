"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { SubmitReport } from "@/views/reports/report-button.view";

const ReportActionContext = createContext<SubmitReport | null>(null);

/** Lets a route supply the report action once for every Report button inside it. */
export function ReportActionProvider({
  action,
  children,
}: {
  readonly action: SubmitReport;
  readonly children: ReactNode;
}) {
  return <ReportActionContext.Provider value={action}>{children}</ReportActionContext.Provider>;
}

export function useReportAction(): SubmitReport | null {
  return useContext(ReportActionContext);
}
