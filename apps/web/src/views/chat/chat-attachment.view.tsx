"use client";

/* eslint-disable @next/next/no-img-element -- previews use short-lived signed Storage URLs. */
import { useEffect, useRef, useState } from "react";

import {
  attachmentKind,
  attachmentLabel,
  canSaveToDocuments,
  chatAttachmentHref,
  type ChatAttachment,
} from "@/models/chat/chat.model";
import { DownloadIcon, FileIcon } from "@/views/chat/chat-icons.view";

export type AttachmentSaveState = "idle" | "saving" | "saved";

interface ChatAttachmentViewProps {
  readonly messageId: number;
  readonly attachment: ChatAttachment;
  readonly saveState: AttachmentSaveState;
  readonly onSaveToDocuments: () => void;
}

/**
 * A shared file. Clicking it asks where to keep it: a private copy in
 * My Documents, or a download to this device.
 */
export function ChatAttachmentView({
  messageId,
  attachment,
  saveState,
  onSaveToDocuments,
}: ChatAttachmentViewProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const kind = attachmentKind(attachment.mimeType);
  const downloadHref = chatAttachmentHref(messageId);
  const savable = canSaveToDocuments(attachment.mimeType);
  const menuId = `chat-attachment-menu-${messageId}`;

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const saveTitle =
    saveState === "saved"
      ? "Saved to My Documents"
      : saveState === "saving"
        ? "Saving to My Documents..."
        : "Save to My Documents";
  const saveDetail = savable
    ? "Keep a private copy you can analyse or make a quiz from"
    : "Only PDF and DOCX files can be saved to My Documents";

  return (
    <div className="chat-attachment" ref={rootRef}>
      <button
        className={kind === "image" && attachment.previewUrl ? "chat-image" : "chat-file"}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={`Save ${attachment.name}`}
      >
        {kind === "image" && attachment.previewUrl ? (
          <img src={attachment.previewUrl} alt={attachment.name} loading="lazy" />
        ) : (
          <>
            <span className={`chat-file-type ${kind}`} aria-hidden="true">
              {kind === "image" ? "IMG" : kind.toUpperCase()}
            </span>
            <span className="chat-file-text">
              <span className="chat-file-name">{attachment.name}</span>
              <span className="chat-file-meta">{attachmentLabel(attachment)}</span>
            </span>
            <span className="chat-file-download" aria-hidden="true">
              <DownloadIcon />
            </span>
          </>
        )}
      </button>

      {open ? (
        <div className="chat-save-menu" id={menuId} role="menu" aria-label={`Save ${attachment.name}`}>
          <button
            type="button"
            role="menuitem"
            disabled={!savable || saveState !== "idle"}
            onClick={() => {
              setOpen(false);
              onSaveToDocuments();
            }}
          >
            <span className="chat-attach-icon documents" aria-hidden="true">
              <FileIcon />
            </span>
            <span>
              <strong>{saveTitle}</strong>
              <small>{saveDetail}</small>
            </span>
          </button>
          <a role="menuitem" href={downloadHref} onClick={() => setOpen(false)}>
            <span className="chat-attach-icon upload" aria-hidden="true">
              <DownloadIcon />
            </span>
            <span>
              <strong>Download to this device</strong>
              <small>Save the file to your computer</small>
            </span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
