"use client";

import { useActionState } from "react";

import {
  forumReportReasonRules,
  type ForumReportFormState,
} from "@/models/forum/forum.model";

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

  return (
    <details className="forum-report">
      <summary>Report</summary>
      {state.notice ? (
        <p className="field-hint success" role="status">{state.notice}</p>
      ) : (
        <form action={formAction}>
          {threadId ? <input type="hidden" name="threadId" value={threadId} /> : null}
          {commentId ? <input type="hidden" name="commentId" value={commentId} /> : null}
          <label htmlFor={id}>What is wrong with this {threadId ? "post" : "comment"}?</label>
          <textarea
            id={id}
            name="reason"
            rows={2}
            minLength={forumReportReasonRules.min}
            maxLength={forumReportReasonRules.max}
            placeholder="e.g. spam, offensive language, academic dishonesty"
            required
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
