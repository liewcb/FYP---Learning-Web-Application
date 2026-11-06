"use client";

import { useActionState } from "react";

import {
  libraryRules,
  type LibraryReviewFormState,
  type LibraryStatus,
} from "@/models/library/library.model";

export type LibraryReviewAction = (
  state: LibraryReviewFormState,
  formData: FormData,
) => Promise<LibraryReviewFormState>;

interface LibraryReviewActionsProps {
  readonly materialId: number;
  readonly status: LibraryStatus;
  readonly action: LibraryReviewAction;
}

export function LibraryReviewActions({ materialId, status, action }: LibraryReviewActionsProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const pendingReview = status === "pending_review";
  const published = status === "published";

  if (!pendingReview && !published) {
    return null;
  }

  const inputId = `review-note-${materialId}`;

  return (
    <form className="lib-review-form" action={formAction}>
      <input type="hidden" name="materialId" value={materialId} />

      <label className="visually-hidden" htmlFor={inputId}>
        Reason for your decision
      </label>
      <textarea
        id={inputId}
        name="note"
        rows={2}
        defaultValue={state.note ?? ""}
        maxLength={libraryRules.noteMax}
        placeholder={
          pendingReview
            ? "Reason (required to reject, optional to approve). The student can read it."
            : "Reason for archiving (required). The student can read it."
        }
      />

      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p className="field-hint success" role="status">
          {state.notice}
        </p>
      ) : null}

      <div className="lib-review-buttons">
        {pendingReview ? (
          <>
            <button
              className="button button-dark"
              type="submit"
              name="decision"
              value="publish"
              disabled={pending}
            >
              {pending ? "Saving..." : "Approve & publish"}
            </button>
            <button
              className="button lib-button-danger"
              type="submit"
              name="decision"
              value="reject"
              disabled={pending}
            >
              Reject
            </button>
          </>
        ) : (
          <button
            className="button lib-button-danger"
            type="submit"
            name="decision"
            value="archive"
            disabled={pending}
          >
            {pending ? "Saving..." : "Archive"}
          </button>
        )}
      </div>
    </form>
  );
}