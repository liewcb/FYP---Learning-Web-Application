"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

interface ReportReviewDialogProps {
  /** The queue as it was, without this report: where closing goes. */
  readonly closeHref: string;
  readonly labelledBy: string;
  readonly children: ReactNode;
}

/**
 * Shows one report over the queue, like a study buddy's "View profile".
 * The report is in the address (?report=ID), so the window survives a
 * refresh and closing it simply returns to the queue.
 */
export function ReportReviewDialog({ closeHref, labelledBy, children }: ReportReviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      dialogRef.current?.close();
    }
  }

  return (
    <dialog
      className="buddy-dialog report-review-dialog"
      ref={dialogRef}
      aria-labelledby={labelledBy}
      onClose={() => router.replace(closeHref, { scroll: false })}
      onClick={closeOnBackdrop}
    >
      <div className="report-review-window">
        <button
          className="buddy-dialog-close"
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close report"
        >
          ×
        </button>
        {children}
      </div>
    </dialog>
  );
}
