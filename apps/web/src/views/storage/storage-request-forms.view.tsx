"use client";

import { useActionState } from "react";

import {
  storageRequestAmounts,
  storageRequestRules,
  type StorageRequestFormState,
} from "@/models/storage/storage-request.model";

export type StorageRequestAction = (
  state: StorageRequestFormState,
  formData: FormData,
) => Promise<StorageRequestFormState>;

interface StorageRequestFormProps {
  readonly action: StorageRequestAction;
  readonly amounts: readonly (typeof storageRequestAmounts)[number][];
}

export function StorageRequestForm({ action, amounts }: StorageRequestFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  if (state.notice) {
    return <p className="saved-result-note" role="status">{state.notice}</p>;
  }

  return (
    <form className="storage-request-form" action={formAction}>
      <fieldset className="storage-amounts">
        <legend>How much extra space do you need?</legend>
        {amounts.map((amount, index) => (
          <label key={amount.bytes}>
            <input
              type="radio"
              name="additionalBytes"
              value={amount.bytes}
              defaultChecked={index === 0}
            />
            <span>{amount.label}</span>
          </label>
        ))}
      </fieldset>

      <div className="form-field">
        <label htmlFor="storage-reason">Why do you need it?</label>
        <textarea
          id="storage-reason"
          name="reason"
          rows={3}
          defaultValue={state.reason ?? ""}
          minLength={storageRequestRules.reasonMin}
          maxLength={storageRequestRules.reasonMax}
          placeholder="e.g. I am uploading all lecture slides for my final year modules."
          required
        />
        <p className="field-hint">An administrator reads this before deciding.</p>
      </div>

      {state.error ? <p className="form-alert" role="alert">{state.error}</p> : null}

      <button className="button button-dark" type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send request"}
      </button>
    </form>
  );
}

export function CancelStorageRequestButton({
  action,
  requestId,
}: {
  readonly action: StorageRequestAction;
  readonly requestId: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <button className="button button-outline" type="submit" disabled={pending}>
        {pending ? "Cancelling..." : "Cancel request"}
      </button>
      {state.error ? <p className="field-error" role="alert">{state.error}</p> : null}
    </form>
  );
}
