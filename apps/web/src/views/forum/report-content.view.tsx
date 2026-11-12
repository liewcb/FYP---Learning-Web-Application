"use client";

import { useActionState } from "react";

import type { ForumReportFormState } from "@/models/forum/forum.model";
import { reportReasons, reportRules } from "@/models/reports/report.model";

export type ForumReportAction = (
  state: ForumReportFormState,
  formData: FormData,
) => Promise<ForumReportFormState>;

interface ReportContentViewProps {
  readonly action: ForumReportAction;
  readonly threadId?: number;
  readonly commentId?: number;
}

/** A small "Report" disclosure that sends a reason to the moderators. */
export function ReportContentView({ action, threadId, commentId }: ReportContentViewProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const id = `report-${threadId ? `thread-${threadId}` : `comment-${commentId}`}`;
  const what = threadId ? "post" : "comment";

  return (
    <details className="forum-report">
      <summary>Report</summary>
      {state.notice ? (
        <p className="field-hint success" role="status">{state.notice}</p>
      ) : (
        <form action={formAction}>
          {threadId ? <input type="hidden" name="threadId" value={threadId} /> : null}
          {commentId ? <input type="hidden" name="commentId" value={commentId} /> : null}
          <label htmlFor={`${id}-category`}>What is wrong with this {what}?</label>
          <select id={`${id}-category`} name="category" required defaultValue="">
            <option value="" disabled>
              Choose a reason
            </option>
            {reportReasons.map((reason) => (
              <option key={reason.value} value={reason.value}>
                {reason.label}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-details`}>Details (required for “Something else”)</label>
          <textarea
            id={`${id}-details`}
            name="details"
            rows={2}
            maxLength={reportRules.detailsMax}
            placeholder="Tell the moderators what happened"
          />
          {state.error ? <p className="field-error" role="alert">{state.error}</p> : null}
          <button className="button button-outline" type="submit" disabled={pending}>
            {pending ? "Sending..." : "Send report"}
          </button>
        </form>
      )}
    </details>
  );
}
