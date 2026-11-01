"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";

import { revisionRules, subjectColours, type SubjectColour } from "@/models/revision/revision.model";

function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return ref;
}

function RevisionDialog({
  open,
  labelledBy,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly labelledBy: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const ref = useModal(open);

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <dialog
      className="rev-dialog"
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={closeOnBackdrop}
    >
      {open ? children : null}
    </dialog>
  );
}

export interface RevisionConfirmRequest {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
}

export function RevisionConfirmDialog({
  request,
  onClose,
}: {
  readonly request: RevisionConfirmRequest | null;
  readonly onClose: () => void;
}) {
  return (
    <RevisionDialog open={request !== null} labelledBy="rev-confirm-title" onClose={onClose}>
      {request ? (
        <div className="rev-dialog-panel">
          <h2 id="rev-confirm-title">{request.title}</h2>
          <p>{request.body}</p>
          <div className="rev-dialog-actions">
            <button className="button button-outline" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="button rev-button-danger"
              type="button"
              onClick={() => {
                request.onConfirm();
                onClose();
              }}
            >
              {request.confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </RevisionDialog>
  );
}

export interface SubjectFormRequest {
  readonly mode: "create" | "rename";
  readonly name: string;
  readonly colour: SubjectColour;
  /** Resolves to an error message, or null once saved. */
  readonly onSubmit: (name: string, colour: SubjectColour) => Promise<string | null>;
}

const colourLabels: Record<SubjectColour, string> = {
  navy: "Navy",
  gold: "Gold",
  green: "Green",
  blue: "Blue",
  red: "Red",
  purple: "Purple",
};

function SubjectForm({
  request,
  onClose,
}: {
  readonly request: SubjectFormRequest;
  readonly onClose: () => void;
}) {
  const [name, setName] = useState(request.name);
  const [colour, setColour] = useState<SubjectColour>(request.colour);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const failure = await request.onSubmit(name, colour);

      if (failure) {
        setError(failure);
      } else {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="rev-dialog-panel" onSubmit={submit}>
      <h2 id="rev-subject-title">{request.mode === "create" ? "New subject" : "Rename subject"}</h2>
      <label className="rev-field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          maxLength={revisionRules.subjectNameMaxLength}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Database Systems"
          autoFocus
          required
        />
      </label>
      {request.mode === "create" ? (
        <fieldset className="rev-colour-picker">
          <legend>Colour</legend>
          {subjectColours.map((option) => (
            <label key={option} className={`rev-colour-option ${option}`} title={colourLabels[option]}>
              <input
                type="radio"
                name="colour"
                value={option}
                checked={colour === option}
                onChange={() => setColour(option)}
              />
              <span className="visually-hidden">{colourLabels[option]}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {error ? (
        <p className="rev-form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="rev-dialog-actions">
        <button className="button button-outline" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="button button-dark" type="submit" disabled={saving}>
          {saving ? "Saving..." : request.mode === "create" ? "Create subject" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function SubjectDialog({
  request,
  onClose,
}: {
  readonly request: SubjectFormRequest | null;
  readonly onClose: () => void;
}) {
  return (
    <RevisionDialog open={request !== null} labelledBy="rev-subject-title" onClose={onClose}>
      {request ? <SubjectForm request={request} onClose={onClose} /> : null}
    </RevisionDialog>
  );
}
