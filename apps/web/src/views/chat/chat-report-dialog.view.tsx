"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";

import {
  chatReportDetailsMaxLength,
  chatReportReasons,
  type ChatReportReason,
} from "@/models/chat/chat.model";

interface ChatReportDialogProps {
  readonly open: boolean;
  readonly otherName: string;
  readonly alreadyBlocked: boolean;
  /** Resolves to an error message, or null once the report is sent. */
  readonly onSubmit: (reason: ChatReportReason, details: string, block: boolean) => Promise<string | null>;
  readonly onClose: () => void;
}

export function ChatReportDialog({
  open,
  otherName,
  alreadyBlocked,
  onSubmit,
  onClose,
}: ChatReportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ChatReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function close() {
    setReason(null);
    setDetails("");
    setBlock(false);
    setError(null);
    onClose();
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!reason) {
      setError("Choose a reason for the report.");
      return;
    }

    setSending(true);
    setError(null);

    try {
      const failure = await onSubmit(reason, details, block && !alreadyBlocked);

      if (failure) {
        setError(failure);
      } else {
        close();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <dialog
      className="chat-dialog"
      ref={dialogRef}
      aria-labelledby="chat-report-title"
      onClose={close}
      onClick={closeOnBackdrop}
    >
      <form className="chat-dialog-panel" onSubmit={submit}>
        <h2 id="chat-report-title">Report {otherName}</h2>
        <p className="chat-dialog-note">
          Moderators will review this chat. {otherName} will not be told who reported them.
        </p>

        <fieldset className="chat-report-reasons">
          <legend>What is wrong?</legend>
          {chatReportReasons.map((option) => (
            <label key={option.value} className="chat-report-reason">
              <input
                type="radio"
                name="reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>

        <label className="chat-report-details">
          <span>Details (optional)</span>
          <textarea
            rows={3}
            value={details}
            maxLength={chatReportDetailsMaxLength}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Tell the moderators what happened"
          />
        </label>

        {alreadyBlocked ? null : (
          <label className="chat-report-block">
            <input
              type="checkbox"
              checked={block}
              onChange={(event) => setBlock(event.target.checked)}
            />
            <span>Also block {otherName}</span>
          </label>
        )}

        {error ? (
          <p className="chat-composer-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="chat-dialog-actions">
          <button className="button button-outline" type="button" onClick={close}>
            Cancel
          </button>
          <button className="button chat-button-danger" type="submit" disabled={sending}>
            {sending ? "Sending..." : "Report"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
