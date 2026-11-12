"use client";

import { useActionState } from "react";

import {
  storageRequestRules,
  type StorageRequestFormState,
} from "@/models/storage/storage-request.model";

export type StorageDecisionAction = (
  state: StorageRequestFormState,
  formData: FormData,
) => Promise<StorageRequestFormState>;

interface StorageRequestDecisionProps {
  readonly requestId: number;
  readonly approveLabel: string;
  readonly action: StorageDecisionAction;
}

export function StorageRequestDecision({ requestId, approveLabel, action }: StorageRequestDecisionProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const inputId = `storage-note-${requestId}`;

  if (state.notice) {
    return <p className="field-hint success" role="status">{state.notice}</p>;
  }

  return (
    <form className="lib-review-form" action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <label className="visually-hidden" htmlFor={inputId}>Note to the student</label>
      <textarea
        id={inputId}
        name="note"
        rows={2}
        maxLength={storageRequestRules.noteMax}
        placeholder="Note to the student (required to reject, optional to approve)."
      />
      {state.error ? <p className="field-error" role="alert">{state.error}</p> : null}
      <div className="lib-review-buttons">
        <button className="button button-dark" type="submit" name="decision" value="approve" disabled={pending}>
          {pending ? "Saving..." : approveLabel}
        </button>
        <button className="button lib-button-danger" type="submit" name="decision" value="reject" disabled={pending}>
          Reject
        </button>
      </div>
    </form>
  );
}
