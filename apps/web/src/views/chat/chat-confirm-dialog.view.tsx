"use client";

import { useEffect, useRef, type MouseEvent } from "react";

export interface ChatConfirmRequest {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
}

interface ChatConfirmDialogProps {
  readonly request: ChatConfirmRequest | null;
  readonly onClose: () => void;
}

/** Centred confirmation for clear, delete and block, like WhatsApp's prompts. */
export function ChatConfirmDialog({ request, onClose }: ChatConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (request && !dialog.open) {
      dialog.showModal();
    } else if (!request && dialog.open) {
      dialog.close();
    }
  }, [request]);

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <dialog
      className="chat-dialog chat-confirm"
      ref={dialogRef}
      aria-labelledby="chat-confirm-title"
      aria-describedby="chat-confirm-body"
      onClose={onClose}
      onClick={closeOnBackdrop}
    >
      {request ? (
        <div className="chat-dialog-panel">
          <h2 id="chat-confirm-title">{request.title}</h2>
          <p id="chat-confirm-body">{request.body}</p>
          <div className="chat-dialog-actions">
            <button className="button button-outline" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className={request.danger ? "button chat-button-danger" : "button button-dark"}
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
    </dialog>
  );
}
