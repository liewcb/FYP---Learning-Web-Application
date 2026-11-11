"use client";

import { useActionState } from "react";

import {
  moderationReasonMax,
  type ModeratedStatus,
  type ModerationActionState,
  type ModerationKind,
} from "@/models/admin/forum-moderation.model";

export type ModerationFormAction = (
  state: ModerationActionState,
  formData: FormData,
) => Promise<ModerationActionState>;

interface ForumModerationActionsProps {
  readonly kind: ModerationKind;
  readonly id: number;
  readonly status: ModeratedStatus;
  readonly moderateAction: ModerationFormAction;
  /** Present when the actions are shown for a pending report. */
  readonly reportId?: number;
  readonly dismissAction?: ModerationFormAction;
}

const noDismiss: ModerationFormAction = async () => ({});

export function ForumModerationActions({
  kind,
  id,
  status,
  moderateAction,
  reportId,
  dismissAction,
}: ForumModerationActionsProps) {
  const [state, formAction, pending] = useActionState<ModerationActionState, FormData>(
    moderateAction,
    {},
  );
  const [dismissState, dismissFormAction, dismissPending] = useActionState<
    ModerationActionState,
    FormData
  >(dismissAction ?? noDismiss, {});
  const inputId = `moderation-reason-${kind}-${id}-${reportId ?? "item"}`;
  const busy = pending || dismissPending;
  const feedback = state.error || state.notice ? state : dismissState;

  return (
    <div className="lib-review-form">
      <form action={formAction} id={`${inputId}-form`}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        {status === "published" ? (
          <>
            <label className="visually-hidden" htmlFor={inputId}>Reason</label>
            <textarea
              id={inputId}
              name="reason"
              rows={2}
              maxLength={moderationReasonMax}
              placeholder="Reason (required to hide or remove). Kept in the audit log."
            />
          </>
        ) : null}
      </form>

      {reportId && dismissAction ? (
        <form action={dismissFormAction} id={`${inputId}-dismiss`}>
          <input type="hidden" name="reportId" value={reportId} />
        </form>
      ) : null}

      {feedback.error ? <p className="field-error" role="alert">{feedback.error}</p> : null}
      {feedback.notice ? <p className="field-hint success" role="status">{feedback.notice}</p> : null}

      <div className="lib-review-buttons">
        {status === "published" ? (
          <>
            <button
              className="button button-dark"
              type="submit"
              form={`${inputId}-form`}
              name="action"
              value="hide"
              disabled={busy}
            >
              {pending ? "Saving..." : "Hide"}
            </button>
            <button
              className="button lib-button-danger"
              type="submit"
              form={`${inputId}-form`}
              name="action"
              value="delete"
              disabled={busy}
            >
              Remove
            </button>
          </>
        ) : (
          <button
            className="button button-outline"
            type="submit"
            form={`${inputId}-form`}
            name="action"
            value="restore"
            disabled={busy}
          >
            {pending ? "Saving..." : "Restore"}
          </button>
        )}
        {reportId && dismissAction ? (
          <button
            className="button button-outline"
            type="submit"
            form={`${inputId}-dismiss`}
            disabled={busy}
          >
            {dismissPending ? "Saving..." : "Dismiss report"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
