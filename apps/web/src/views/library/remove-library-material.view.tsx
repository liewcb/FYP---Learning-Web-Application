"use client";

import { useActionState, useEffect, useRef, useState, type MouseEvent } from "react";

import {
  libraryRemovalCopy,
  libraryRules,
  type LibraryRemoveFormState,
  type LibraryStatus,
} from "@/models/library/library.model";

export type LibraryRemoveAction = (
  state: LibraryRemoveFormState,
  formData: FormData,
) => Promise<LibraryRemoveFormState>;

interface RemoveLibraryMaterialProps {
  readonly materialId: number;
  readonly materialTitle: string;
  readonly status: LibraryStatus;
  readonly action: LibraryRemoveAction;
  /** "text" fits a card footer; "button" fits the detail page actions. */
  readonly variant?: "text" | "button";
}

/** The author's Withdraw / Remove button with a confirmation dialog. */
export function RemoveLibraryMaterial({
  materialId,
  materialTitle,
  status,
  action,
  variant = "button",
}: RemoveLibraryMaterialProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const copy = libraryRemovalCopy(status);
  const titleId = `remove-material-title-${materialId}`;
  const reasonId = `remove-material-reason-${materialId}`;

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!copy) {
    return null;
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget && !pending) {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        className={variant === "text" ? "text-action lib-remove-link" : "button lib-button-danger"}
        type="button"
        onClick={() => setOpen(true)}
      >
        {copy.buttonLabel}
      </button>

      <dialog
        className="chat-dialog"
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={closeOnBackdrop}
      >
        {open ? (
          <form className="chat-dialog-panel" action={formAction}>
            <input type="hidden" name="materialId" value={materialId} />
            <h2 id={titleId}>{copy.title}</h2>
            <p className="chat-dialog-note">
              <strong>{materialTitle}</strong>
              <br />
              {copy.body}
            </p>

            <label className="chat-report-details" htmlFor={reasonId}>
              Reason (optional, kept in the history)
              <textarea
                id={reasonId}
                name="reason"
                rows={2}
                maxLength={libraryRules.removalReasonMax}
                defaultValue={state.reason ?? ""}
                placeholder="For example: I uploaded a newer version."
                disabled={pending}
              />
            </label>

            {state.error ? (
              <p className="chat-composer-error" role="alert">
                {state.error}
              </p>
            ) : null}

            <div className="chat-dialog-actions">
              <button
                className="button button-outline"
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button className="button chat-button-danger" type="submit" disabled={pending}>
                {pending ? "Removing..." : copy.confirmLabel}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </>
  );
}
