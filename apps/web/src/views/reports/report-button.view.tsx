"use client";

import { useState } from "react";

import type { ReportFormState, ReportReason, ReportTarget } from "@/models/reports/report.model";
import { useReportAction } from "@/views/reports/report-action-context.view";
import { ReportDialog } from "@/views/reports/report-dialog.view";

/** Sends a report; supplied by the route so views never call the server directly. */
export type SubmitReport = (input: {
  readonly targetType: string;
  readonly targetId?: number | null;
  readonly targetUserId?: string | null;
  readonly reason: string;
  readonly details: string;
}) => Promise<ReportFormState>;

interface ReportButtonProps {
  readonly target: ReportTarget;
  readonly title: string;
  readonly note?: string;
  readonly label?: string;
  readonly className?: string;
  /** Defaults to the action a ReportActionProvider above supplies. */
  readonly onReport?: SubmitReport;
}

/** A small "Report" button that opens the report dialog; hidden when no action is supplied. */
export function ReportButton({
  target,
  title,
  note,
  label = "Report",
  className = "text-action report-button",
  onReport,
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const fromContext = useReportAction();
  const report = onReport ?? fromContext;

  if (!report) {
    return null;
  }

  function submit(reason: ReportReason, details: string) {
    return report!({
      targetType: target.type,
      targetId: target.type === "user" ? null : target.id,
      targetUserId: target.type === "user" ? target.userId : null,
      reason,
      details,
    });
  }

  return (
    <>
      <button className={className} type="button" onClick={() => setOpen(true)}>
        {label}
      </button>
      <ReportDialog open={open} title={title} note={note} onSubmit={submit} onClose={() => setOpen(false)} />
    </>
  );
}
