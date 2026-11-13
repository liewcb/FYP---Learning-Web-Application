"use client";

import { useEffect, useState, type KeyboardEvent } from "react";

import type { OriginalFileKind } from "@/models/document/document.model";
import { useDocumentViewers } from "@/views/documents/document-viewers-context.view";

interface OriginalDocumentViewerProps {
  /** Same-site link that checks access and opens the file (see /documents/[id]/file). */
  readonly fileHref: string;
  readonly downloadHref: string;
  readonly kind: OriginalFileKind;
  readonly title: string;
  /** Words to find in the file; a new object finds the next match. */
  readonly find?: { readonly query: string } | null;
}

/** Where the last search found its words: a PDF page, true for Word, or nowhere. */
type FindResult = { readonly query: string; readonly page: number | true | null };

/** Key points are whole sentences; the toolbar shows their start. */
function shortQuery(query: string): string {
  const trimmed = query.trim();

  return trimmed.length > 40 ? `${trimmed.slice(0, 39).trimEnd()}…` : trimmed;
}

type FileState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: ArrayBuffer }
  | { readonly status: "error" };

const zoomSteps = [0.75, 1, 1.25, 1.5, 2] as const;

/** The original PDF or Word file, as it looks, with page and zoom controls for PDFs. */
export function OriginalDocumentViewer({ fileHref, downloadHref, kind, title, find = null }: OriginalDocumentViewerProps) {
  const viewers = useDocumentViewers();
  const [file, setFile] = useState<FileState>({ status: "loading" });
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [zoomIndex, setZoomIndex] = useState(1);
  const [found, setFound] = useState<FindResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(fileHref, { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }

        const data = await response.arrayBuffer();

        if (!cancelled) {
          setFile({ status: "ready", data });
        }
      } catch (error) {
        console.error("Opening the original file failed.", error);

        if (!cancelled) {
          setFile({ status: "error" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileHref]);

  const lastPage = pageCount ?? 1;

  function goTo(next: number) {
    setPage(Math.min(Math.max(1, next), lastPage));
  }

  // Arrow keys and Page Up/Down turn PDF pages.
  function turnPage(event: KeyboardEvent<HTMLDivElement>) {
    if (kind !== "pdf") {
      return;
    }

    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      goTo(page + 1);
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      goTo(page - 1);
    }
  }

  return (
    <div className="original-viewer" tabIndex={-1} onKeyDown={turnPage} aria-label={`Original file: ${title}`}>
      <div className="original-viewer-toolbar">
        {kind === "pdf" ? (
          <>
            <span className="original-viewer-group">
              <button
                className="rev-small-button"
                type="button"
                onClick={() => goTo(page - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className="original-viewer-page" aria-live="polite">
                {pageCount === null ? "Page …" : `Page ${page} of ${pageCount}`}
              </span>
              <button
                className="rev-small-button"
                type="button"
                onClick={() => goTo(page + 1)}
                disabled={pageCount === null || page >= lastPage}
                aria-label="Next page"
              >
                ›
              </button>
            </span>
            <span className="original-viewer-group">
              <button
                className="rev-small-button"
                type="button"
                onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
                disabled={zoomIndex === 0}
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="original-viewer-page">{Math.round(zoomSteps[zoomIndex] * 100)}%</span>
              <button
                className="rev-small-button"
                type="button"
                onClick={() => setZoomIndex((index) => Math.min(zoomSteps.length - 1, index + 1))}
                disabled={zoomIndex === zoomSteps.length - 1}
                aria-label="Zoom in"
              >
                +
              </button>
            </span>
          </>
        ) : (
          <span className="original-viewer-page">Word document</span>
        )}
        {found ? (
          <span className={found.page === null ? "original-viewer-find missing" : "original-viewer-find"} role="status">
            {found.page === null
              ? `“${shortQuery(found.query)}” is not in this file`
              : found.page === true
                ? `“${shortQuery(found.query)}”`
                : `“${shortQuery(found.query)}” · page ${found.page}`}
          </span>
        ) : null}
        <a className="text-action original-viewer-download" href={downloadHref}>
          Download
        </a>
      </div>

      <div className="original-viewer-body">
        {!viewers ? (
          <p className="original-viewer-message">
            This file cannot be shown here. <a href={downloadHref}>Download it</a> instead.
          </p>
        ) : file.status === "loading" ? (
          <p className="original-viewer-message">Opening {title}…</p>
        ) : file.status === "error" ? (
          <p className="original-viewer-message">
            The file could not be opened. <a href={downloadHref}>Download it</a> instead.
          </p>
        ) : kind === "pdf" ? (
          <viewers.Pdf
            data={file.data}
            page={page}
            zoom={zoomSteps[zoomIndex]}
            find={find}
            onFind={(page) => {
              if (page !== null) {
                setPage(page);
              }

              setFound(find ? { query: find.query, page } : null);
            }}
            onLoaded={setPageCount}
            onError={() => setFile({ status: "error" })}
          />
        ) : (
          <viewers.Docx
            data={file.data}
            scrollTo={null}
            onScroll={() => undefined}
            find={find}
            onFind={(match) => setFound(find ? { query: find.query, page: match ? true : null } : null)}
            onLoaded={() => undefined}
            onError={() => setFile({ status: "error" })}
          />
        )}
      </div>
    </div>
  );
}
