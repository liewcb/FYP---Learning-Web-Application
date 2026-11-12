"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";

import {
  myReportsPath,
  reportReasons,
  reportRules,
  type ReportFormState,
  type ReportReason,
} from "@/models/reports/report.model";

interface ReportDialogProps {
  readonly open: boolean;
  /** "Report message", "Report Tan Wei Jie's profile"... */
  readonly title: string;
  readonly note?: string;
  readonly onSubmit: (reason: ReportReason, details: string) => Promise<ReportFormState>;
  readonly onClose: () => void;
}

/** Choose a reason, add details, send: the same for every kind of report. */
export function ReportDialog({ open, title, note, onSubmit, onClose }: ReportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setError(null);
    setNotice(null);
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

    if (reason === "other" && !details.trim()) {
      setError("Describe the problem so a moderator knows what to look for.");
      return;
    }

    setSending(true);
    setError(null);

    try {
      const result = await onSubmit(reason, details);

      if (result.notice) {
        setNotice(result.notice);
      } else {
        setError(result.error ?? "The report could not be sent. Please try again.");
      }
    } catch {
      setError("The report could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <dialog
      className="chat-dialog"
      ref={dialogRef}
      aria-labelledby="report-dialog-title"
      onClose={close}
      onClick={closeOnBackdrop}
    >
      {notice ? (
        <div className="chat-dialog-panel">
          <h2 id="report-dialog-title">Report sent</h2>
          <p className="chat-dialog-note" role="status">
            {notice}
          </p>
          <div className="chat-dialog-actions">
            <Link className="button button-outline" href={myReportsPath}>
              My reports
            </Link>
            <button className="button button-dark" type="button" onClick={close}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form className="chat-dialog-panel" onSubmit={submit}>
          <h2 id="report-dialog-title">{title}</h2>
          <p className="chat-dialog-note">
            {note ?? "Moderators will review it. The person you report is not told who reported them."}
          </p>

          <fieldset className="chat-report-reasons">
            <legend>What is wrong?</legend>
            {reportReasons.map((option) => (
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
            <span>Details {reason === "other" ? "(required)" : "(optional)"}</span>
            <textarea
              rows={3}
              value={details}
              maxLength={reportRules.detailsMax}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Tell the moderators what happened"
            />
          </label>

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
              {sending ? "Sending..." : "Send report"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
