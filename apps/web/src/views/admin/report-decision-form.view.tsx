"use client";

import { useActionState, useState } from "react";

import {
  decisionSuspends,
  reportDecisionLabels,
  reportRules,
  resolutionSummaries,
  type ReportDecision,
  type ReportDecisionState,
  type ReportResolution,
} from "@/models/reports/report.model";

export type ReportDecisionAction = (
  state: ReportDecisionState,
  formData: FormData,
) => Promise<ReportDecisionState>;

const resolutionFor: Record<ReportDecision, ReportResolution> = {
  no_violation: "no_violation",
  remove_content: "content_removed",
  suspend_user: "user_suspended",
  remove_and_suspend: "removed_and_suspended",
};

interface ReportDecisionFormProps {
  readonly reportId: number;
  readonly decisions: readonly ReportDecision[];
  readonly reportedName: string | null;
  readonly openReports: number;
  readonly action: ReportDecisionAction;
}

/** Decide a report: the reporters are told the outcome, and the reason goes to the audit log. */
export function ReportDecisionForm({
  reportId,
  decisions,
  reportedName,
  openReports,
  action,
}: ReportDecisionFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [decision, setDecision] = useState<ReportDecision>("no_violation");
  const needsReason = decision !== "no_violation";

  if (state.notice) {
    return (
      <p className="report-decision-notice" role="status">
        {state.notice}
      </p>
    );
  }

  return (
    <form className="report-decision" action={formAction}>
      <input type="hidden" name="reportId" value={reportId} />

      <fieldset>
        <legend>Decision</legend>
        {decisions.map((option) => (
          <label key={option} className="report-decision-option">
            <input
              type="radio"
              name="decision"
              value={option}
              checked={decision === option}
              onChange={() => setDecision(option)}
            />
            <span>{reportDecisionLabels[option]}</span>
          </label>
        ))}
      </fieldset>

      {decisionSuspends(decision) ? (
        <p className="report-decision-warning">
          {reportedName ?? "This student"} will be signed out and cannot sign in until an
          administrator reactivates the account in User management.
        </p>
      ) : null}

      <label className="report-decision-field" htmlFor={`report-${reportId}-message`}>
        <span>Message to the reporter (optional)</span>
        <textarea
          id={`report-${reportId}-message`}
          name="reporterMessage"
          rows={2}
          maxLength={reportRules.messageMax}
          placeholder={resolutionSummaries[resolutionFor[decision]]}
        />
        <small>
          They always see: “{resolutionSummaries[resolutionFor[decision]]}”
          {openReports > 1 ? ` All ${openReports} reporters get the same message.` : ""}
        </small>
      </label>

      <label className="report-decision-field" htmlFor={`report-${reportId}-note`}>
        <span>Reason {needsReason ? "(required, audit log only)" : "(optional, audit log only)"}</span>
        <textarea
          id={`report-${reportId}-note`}
          name="note"
          rows={2}
          maxLength={reportRules.noteMax}
          required={needsReason}
          placeholder="Why you decided this. Students never see it."
        />
      </label>

      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        className={needsReason ? "button chat-button-danger" : "button button-dark"}
        type="submit"
        disabled={pending}
      >
        {pending ? "Saving..." : openReports > 1 ? `Decide ${openReports} reports` : "Save decision"}
      </button>
    </form>
  );
}
