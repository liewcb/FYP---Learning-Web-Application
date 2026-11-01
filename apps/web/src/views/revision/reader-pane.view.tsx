"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import {
  documentKind,
  passageText,
  type ReaderBlock,
  type ReaderDocument,
} from "@/models/revision/revision.model";
import {
  BookIcon,
  ExternalIcon,
  HighlightIcon,
  NotePlusIcon,
} from "@/views/revision/revision-icons.view";

/** Where the reader should scroll next; `key` changes to repeat a jump. */
export interface ReaderFocus {
  readonly sentence: number;
  readonly flash: boolean;
  readonly key: number;
}

interface ReaderPaneProps {
  readonly reader: ReaderDocument | null;
  readonly loading: boolean;
  readonly hasSources: boolean;
  readonly highlights: ReadonlySet<number>;
  /** Notes linked to each passage, by its first sentence. */
  readonly noteCounts: ReadonlyMap<number, number>;
  readonly progressPercent: number;
  readonly focus: ReaderFocus | null;
  readonly onToggleHighlight: (start: number) => void;
  readonly onAddNote: (start: number, text: string) => void;
  readonly onNewNote: () => void;
  readonly onShowNotes: (start: number) => void;
  /** Reports the first passage in view, or the last sentence at the very end. */
  readonly onProgress: (sentence: number) => void;
}

const flashMs = 1800;
const bottomTolerancePx = 12;

function Passage({
  block,
  highlighted,
  noteCount,
  onToggleHighlight,
  onAddNote,
  onShowNotes,
}: {
  readonly block: Extract<ReaderBlock, { kind: "passage" }>;
  readonly highlighted: boolean;
  readonly noteCount: number;
  readonly onToggleHighlight: (start: number) => void;
  readonly onAddNote: (start: number, text: string) => void;
  readonly onShowNotes: (start: number) => void;
}) {
  return (
    <div
      className={highlighted ? "rev-passage highlighted" : "rev-passage"}
      data-anchor={block.start}
      data-passage={block.start}
    >
      <p>
        {block.sentences.map((sentence) =>
          sentence.key ? (
            <mark className="rev-key" key={sentence.index}>
              {sentence.text}{" "}
            </mark>
          ) : (
            <span key={sentence.index}>{sentence.text} </span>
          ),
        )}
      </p>
      <div className="rev-passage-tools">
        <button
          className="rev-tool-button"
          type="button"
          onClick={() => onAddNote(block.start, passageText(block))}
          aria-label="Add this passage to a new note"
          title="Add to note"
        >
          <NotePlusIcon />
        </button>
        <button
          className={highlighted ? "rev-tool-button active" : "rev-tool-button"}
          type="button"
          onClick={() => onToggleHighlight(block.start)}
          aria-pressed={highlighted}
          aria-label={highlighted ? "Remove highlight" : "Highlight this passage"}
          title={highlighted ? "Remove highlight" : "Highlight"}
        >
          <HighlightIcon />
        </button>
        {noteCount > 0 ? (
          <button
            className="rev-note-count"
            type="button"
            onClick={() => onShowNotes(block.start)}
            aria-label={`${noteCount} note${noteCount === 1 ? "" : "s"} on this passage`}
            title="Show notes"
          >
            {noteCount}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ReaderPane({
  reader,
  loading,
  hasSources,
  highlights,
  noteCounts,
  progressPercent,
  focus,
  onToggleHighlight,
  onAddNote,
  onNewNote,
  onShowNotes,
  onProgress,
}: ReaderPaneProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const onProgressRef = useRef(onProgress);
  const readerId = reader?.id ?? null;
  const lastSentence = reader ? reader.sentenceCount - 1 : 0;

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  // Track the first passage on screen as the reading position.
  useEffect(() => {
    const container = scrollRef.current;

    if (!container || readerId === null) {
      return;
    }

    const visible = new Set<number>();

    function report() {
      if (!container) {
        return;
      }

      const atEnd =
        container.scrollTop + container.clientHeight >= container.scrollHeight - bottomTolerancePx;

      if (atEnd) {
        onProgressRef.current(lastSentence);
      } else if (visible.size > 0) {
        onProgressRef.current(Math.min(...visible));
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const start = Number((entry.target as HTMLElement).dataset.passage);

          if (entry.isIntersecting) {
            visible.add(start);
          } else {
            visible.delete(start);
          }
        }

        report();
      },
      { root: container, threshold: 0.6 },
    );

    container.querySelectorAll<HTMLElement>("[data-passage]").forEach((element) => observer.observe(element));
    container.addEventListener("scroll", report, { passive: true });

    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", report);
    };
  }, [readerId, lastSentence]);

  // Scroll to a passage when resuming, or jumping from a note or key point.
  useEffect(() => {
    const container = scrollRef.current;

    if (!container || !focus) {
      return;
    }

    let target: HTMLElement | null = null;

    for (const element of container.querySelectorAll<HTMLElement>("[data-anchor]")) {
      if (Number(element.dataset.anchor) <= focus.sentence) {
        target = element;
      } else {
        break;
      }
    }

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: focus.flash ? "smooth" : "auto", block: focus.flash ? "center" : "start" });

    if (!focus.flash) {
      return;
    }

    const element = target;
    element.classList.remove("rev-flash");
    // Force a reflow so the animation restarts when the same passage is chosen again.
    void element.offsetWidth;
    element.classList.add("rev-flash");
    const timer = window.setTimeout(() => element.classList.remove("rev-flash"), flashMs);

    return () => window.clearTimeout(timer);
  }, [focus, readerId]);

  if (!reader) {
    return (
      <section className="rev-pane rev-reader rev-reader-empty" aria-label="Reader">
        <BookIcon />
        {loading ? (
          <p>Opening the document…</p>
        ) : hasSources ? (
          <>
            <h2>Choose a document to read</h2>
            <p>Documents appear here once their text has been extracted.</p>
          </>
        ) : (
          <>
            <h2>Your revision space</h2>
            <p>Upload lecture notes or slides, then read them here, highlight key passages and keep your own notes beside them.</p>
            <Link className="button button-dark" href="/documents">
              Upload a document
            </Link>
          </>
        )}
      </section>
    );
  }

  const kind = documentKind(reader.mimeType);
  const meta = [kind, reader.pageCount ? `${reader.pageCount} pages` : null, `${reader.sentenceCount} sentences`]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rev-pane rev-reader" aria-label={`Reading ${reader.title}`} aria-busy={loading}>
      <header className="rev-reader-header">
        <div className="rev-reader-title">
          <h2>{reader.title}</h2>
          <p>{meta}</p>
        </div>
        <a className="rev-small-button" href={`/documents/${reader.id}/download`} target="_blank" rel="noreferrer">
          <ExternalIcon />
          Open original
        </a>
        <button className="rev-small-button dark" type="button" onClick={onNewNote}>
          <NotePlusIcon />
          New note
        </button>
      </header>

      <div className="rev-reader-progress">
        <span>Reading progress</span>
        <span className="rev-progress" aria-hidden="true">
          <span style={{ width: `${progressPercent}%` }} />
        </span>
        <strong>{progressPercent}%</strong>
        {reader.analysis ? (
          <span className="rev-key-legend">
            <span aria-hidden="true" />
            Key point
          </span>
        ) : null}
      </div>

      <article className="rev-reader-body" ref={scrollRef} aria-label="Document text">
        <div className="rev-reader-column">
          {reader.blocks.map((block) =>
            block.kind === "heading" ? (
              <h3 key={`h-${block.index}`} data-anchor={block.index}>
                {block.text}
              </h3>
            ) : (
              <Passage
                key={`p-${block.start}`}
                block={block}
                highlighted={highlights.has(block.start)}
                noteCount={noteCounts.get(block.start) ?? 0}
                onToggleHighlight={onToggleHighlight}
                onAddNote={onAddNote}
                onShowNotes={onShowNotes}
              />
            ),
          )}
          <p className="rev-reader-end">End of document</p>
        </div>
      </article>
    </section>
  );
}
