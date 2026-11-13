"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";

import {
  documentDownloadHref,
  documentFileHref,
  originalFileKind,
} from "@/models/document/document.model";
import { OriginalDocumentViewer } from "@/views/documents/original-document-viewer.view";

interface DocumentPreviewButtonProps {
  readonly documentId: number;
  readonly title: string;
  readonly mimeType: string;
  readonly className?: string;
  /** What the button shows; the title by default. */
  readonly children?: ReactNode;
}

/** A document's title that opens the original file in a window over the page. */
export function DocumentPreviewButton({
  documentId,
  title,
  mimeType,
  className = "document-title-link",
  children,
}: DocumentPreviewButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  function show() {
    setOpen(true);
    // The viewer mounts with the dialog, so it loads the file only when asked.
    requestAnimationFrame(() => dialogRef.current?.showModal());
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      dialogRef.current?.close();
    }
  }

  return (
    <>
      <button className={className} type="button" onClick={show} title={`View ${title}`}>
        {children ?? <strong>{title}</strong>}
      </button>
      <dialog
        className="buddy-dialog original-viewer-dialog"
        ref={dialogRef}
        aria-label={title}
        onClose={() => setOpen(false)}
        onClick={closeOnBackdrop}
      >
        {open ? (
          <div className="original-viewer-window">
            <header className="original-viewer-window-header">
              <h2>{title}</h2>
              <button
                className="buddy-dialog-close"
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <OriginalDocumentViewer
              fileHref={documentFileHref(documentId)}
              downloadHref={documentDownloadHref(documentId)}
              kind={originalFileKind(mimeType)}
              title={title}
            />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
