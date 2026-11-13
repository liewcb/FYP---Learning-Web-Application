"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import {
  documentDownloadHref,
  documentFileHref,
  originalFileKind,
} from "@/models/document/document.model";
import {
  highlightsBySentence,
  joinHighlight,
  passageStartFor,
  rangeText,
  readerSentenceTexts,
  sentenceSegments,
  trimRange,
  type HighlightColour,
  type StudyHighlight,
  type TextRange,
} from "@/models/revision/highlight.model";
import {
  documentKind,
  passageText,
  quoteFromText,
  type ReaderBlock,
  type ReaderDocument,
} from "@/models/revision/revision.model";
import { OriginalDocumentViewer } from "@/views/documents/original-document-viewer.view";
import {
  HighlightToolbar,
  type HighlightToolbarTarget,
  type ToolbarPlace,
} from "@/views/revision/highlight-toolbar.view";
import { selectedRange } from "@/views/revision/reader-selection";
import {
  BackIcon,
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
  /** Notes linked to each passage, by its first sentence. */
  readonly noteCounts: ReadonlyMap<number, number>;
  readonly progressPercent: number;
  readonly focus: ReaderFocus | null;
  /** The original file is shown instead of the text. */
  readonly showOriginal: boolean;
  /** Words to find in the original file (a study tool's key term). */
  readonly originalFind: { readonly query: string } | null;
  readonly onToggleOriginal: () => void;
  readonly onHighlight: (range: TextRange, colour: HighlightColour) => void;
  readonly onRecolourHighlight: (highlightId: number, colour: HighlightColour) => void;
  readonly onRemoveHighlights: (highlightIds: readonly number[]) => void;
  readonly onAddNote: (start: number, text: string) => void;
  readonly onNewNote: () => void;
  readonly onShowNotes: (start: number) => void;
  /** Reports the first passage in view, or the last sentence at the very end. */
  readonly onProgress: (sentence: number) => void;
}

const flashMs = 1800;
const bottomTolerancePx = 12;
/** Room the toolbar needs above the text before it is shown below instead. */
const toolbarRoomPx = 64;
/** Half the toolbar's width, so it stays inside the column. */
const toolbarHalfWidthPx = 150;

type SentenceHighlights = ReadonlyMap<number, readonly StudyHighlight[]>;

/** A sentence's text, with its highlights drawn in. */
function SentenceText({
  index,
  text,
  keyPoint,
  highlights,
}: {
  readonly index: number;
  readonly text: string;
  readonly keyPoint: boolean;
  readonly highlights: readonly StudyHighlight[] | undefined;
}) {
  const content = sentenceSegments(index, text.length, highlights ?? []).map((segment) => {
    const piece = text.slice(segment.from, segment.to);

    return segment.highlight ? (
      <mark
        key={segment.from}
        className="rev-hl"
        data-colour={segment.highlight.colour}
        data-highlight={segment.highlight.id}
      >
        {piece}
      </mark>
    ) : (
      <Fragment key={segment.from}>{piece}</Fragment>
    );
  });

  return keyPoint ? (
    <mark className="rev-key" data-sentence={index}>
      {content}
    </mark>
  ) : (
    <span data-sentence={index}>{content}</span>
  );
}

/** Where the toolbar goes for text at `box`: above it, or below when it is near the top. */
function toolbarPlace(column: HTMLElement, body: HTMLElement, box: DOMRect): ToolbarPlace {
  const columnBox = column.getBoundingClientRect();
  const below = box.top - body.getBoundingClientRect().top < toolbarRoomPx;
  const half = Math.min(toolbarHalfWidthPx, columnBox.width / 2);

  return {
    top: (below ? box.bottom : box.top) - columnBox.top,
    left: Math.min(Math.max(box.left + box.width / 2 - columnBox.left, half), columnBox.width - half),
    below,
  };
}

function Passage({
  block,
  highlights,
  noteCount,
  onAddNote,
  onShowNotes,
}: {
  readonly block: Extract<ReaderBlock, { kind: "passage" }>;
  readonly highlights: SentenceHighlights;
  readonly noteCount: number;
  readonly onAddNote: (start: number, text: string) => void;
  readonly onShowNotes: (start: number) => void;
}) {
  return (
    <div className="rev-passage" data-anchor={block.start} data-passage={block.start}>
      <p>
        {block.sentences.map((sentence, position) => {
          const next = block.sentences[position + 1];
          // One highlight over two sentences also covers the space between them.
          const join = next
            ? joinHighlight(sentence.index, sentence.text.length, next.index, highlights.get(sentence.index) ?? [])
            : null;

          return (
            <Fragment key={sentence.index}>
              <SentenceText
                index={sentence.index}
                text={sentence.text}
                keyPoint={sentence.key}
                highlights={highlights.get(sentence.index)}
              />
              {join ? (
                <mark className="rev-hl" data-colour={join.colour} data-highlight={join.id}>
                  {" "}
                </mark>
              ) : (
                " "
              )}
            </Fragment>
          );
        })}
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
  noteCounts,
  progressPercent,
  focus,
  showOriginal,
  originalFind,
  onToggleOriginal,
  onHighlight,
  onRecolourHighlight,
  onRemoveHighlights,
  onAddNote,
  onNewNote,
  onShowNotes,
  onProgress,
}: ReaderPaneProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const onProgressRef = useRef(onProgress);
  const readerId = reader?.id ?? null;
  const lastSentence = reader ? reader.sentenceCount - 1 : 0;
  const highlightList = reader?.highlights;
  const blocks = reader?.blocks;
  const highlights = useMemo(() => highlightsBySentence(highlightList ?? []), [highlightList]);
  const sentenceTexts = useMemo(() => readerSentenceTexts(blocks ?? []), [blocks]);
  /** The highlight toolbar, for the document it was opened on. */
  const [toolbarState, setToolbarState] = useState<{
    readonly readerId: number;
    readonly target: HighlightToolbarTarget;
  } | null>(null);
  const toolbarTarget = (() => {
    if (!toolbarState || toolbarState.readerId !== readerId || showOriginal) {
      return null;
    }

    const { target } = toolbarState;

    if (target.kind === "selection") {
      return target;
    }

    // Always the highlight as it is now (its colour may have changed); gone when removed.
    const live = highlightList?.find((highlight) => highlight.id === target.highlight.id);
    return live ? { ...target, highlight: live } : null;
  })();

  // Selecting text in the reader offers the highlight colours above it.
  useEffect(() => {
    if (readerId === null) {
      return;
    }

    let timer: number | undefined;

    const selectionChanged = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const column = columnRef.current;
        const body = scrollRef.current;
        const selection = window.getSelection();
        const selected = column ? selectedRange(column, selection) : null;
        // Only the words: a double-click also takes the space after the word.
        const range = selected ? trimRange(sentenceTexts, selected) : null;

        if (!column || !body || !selection || !range) {
          // A click elsewhere ends a selection; an open highlight's toolbar stays.
          setToolbarState((current) => (current?.target.kind === "selection" ? null : current));
          return;
        }

        const domRange = selection.getRangeAt(0);
        const box = domRange.getClientRects()[0] ?? domRange.getBoundingClientRect();

        setToolbarState({ readerId, target: { kind: "selection", range, ...toolbarPlace(column, body, box) } });
      }, 120);
    };

    document.addEventListener("selectionchange", selectionChanged);

    return () => {
      document.removeEventListener("selectionchange", selectionChanged);
      window.clearTimeout(timer);
    };
  }, [readerId, sentenceTexts]);

  // Clicking a highlight offers to recolour or remove it.
  function openHighlight(event: MouseEvent<HTMLElement>) {
    const mark = (event.target as Element).closest<HTMLElement>("mark[data-highlight]");
    const column = columnRef.current;
    const body = scrollRef.current;
    const highlight = highlightList?.find((item) => item.id === Number(mark?.dataset.highlight));

    // Dragging over a highlight selects text instead; unsaved highlights wait.
    if (!mark || !column || !body || !highlight || highlight.id < 0 || readerId === null) {
      return;
    }

    if (window.getSelection()?.isCollapsed === false) {
      return;
    }

    const box = mark.getClientRects()[0] ?? mark.getBoundingClientRect();
    setToolbarState({ readerId, target: { kind: "highlight", highlight, ...toolbarPlace(column, body, box) } });
  }

  function closeToolbar() {
    setToolbarState(null);
  }

  function finishSelection() {
    window.getSelection()?.removeAllRanges();
    closeToolbar();
  }

  function pickColour(colour: HighlightColour) {
    if (toolbarTarget?.kind === "selection") {
      onHighlight(toolbarTarget.range, colour);
      finishSelection();
    } else if (toolbarTarget) {
      if (colour !== toolbarTarget.highlight.colour) {
        onRecolourHighlight(toolbarTarget.highlight.id, colour);
      }

      closeToolbar();
    }
  }

  function noteFromToolbar() {
    if (!toolbarTarget || !blocks) {
      return;
    }

    const range = toolbarTarget.kind === "selection" ? toolbarTarget.range : toolbarTarget.highlight;
    const start = passageStartFor(blocks, range.start.sentence) ?? range.start.sentence;

    onAddNote(start, quoteFromText(rangeText(sentenceTexts, range)));
    finishSelection();
  }

  function removeFromToolbar() {
    if (toolbarTarget?.kind === "highlight") {
      onRemoveHighlights([toolbarTarget.highlight.id]);
    }

    closeToolbar();
  }

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
            <h2>No documents yet</h2>
            <p>Upload notes or slides to read, highlight and annotate them here.</p>
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
        <button
          className={showOriginal ? "rev-small-button gold" : "rev-small-button"}
          type="button"
          aria-pressed={showOriginal}
          onClick={onToggleOriginal}
        >
          {showOriginal ? <BackIcon /> : <ExternalIcon />}
          {showOriginal ? "Back to text" : "View original"}
        </button>
        <button className="rev-small-button dark" type="button" onClick={onNewNote}>
          <NotePlusIcon />
          New note
        </button>
      </header>

      {showOriginal ? (
        <OriginalDocumentViewer
          fileHref={documentFileHref(reader.id)}
          downloadHref={documentDownloadHref(reader.id)}
          kind={originalFileKind(reader.mimeType)}
          title={reader.title}
          find={originalFind}
        />
      ) : null}

      {/* Kept mounted while the original is shown, so the reading place is kept. */}
      <div className="rev-reader-progress" hidden={showOriginal}>
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
        <span className="rev-hl-hint">
          <HighlightIcon />
          Select text to highlight
        </span>
      </div>

      <article
        className="rev-reader-body"
        ref={scrollRef}
        aria-label="Document text"
        hidden={showOriginal}
        onClick={openHighlight}
      >
        <div className="rev-reader-column" ref={columnRef}>
          {reader.blocks.map((block) =>
            block.kind === "heading" ? (
              <h3 key={`h-${block.index}`} data-anchor={block.index}>
                <SentenceText
                  index={block.index}
                  text={block.text}
                  keyPoint={false}
                  highlights={highlights.get(block.index)}
                />
              </h3>
            ) : (
              <Passage
                key={`p-${block.start}`}
                block={block}
                highlights={highlights}
                noteCount={noteCounts.get(block.start) ?? 0}
                onAddNote={onAddNote}
                onShowNotes={onShowNotes}
              />
            ),
          )}
          <p className="rev-reader-end">End of document</p>
          {toolbarTarget ? (
            <HighlightToolbar
              target={toolbarTarget}
              onColour={pickColour}
              onNote={noteFromToolbar}
              onRemove={removeFromToolbar}
              onClose={closeToolbar}
            />
          ) : null}
        </div>
      </article>
    </section>
  );
}
