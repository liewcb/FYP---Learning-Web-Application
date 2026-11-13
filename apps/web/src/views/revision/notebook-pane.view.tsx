"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  formatNoteTime,
  noteDisplayTitle,
  noteSnippet,
  revisionRules,
  type ReaderDocument,
  type RevisionQuiz,
  type RevisionSource,
  type StudyNote,
} from "@/models/revision/revision.model";
import {
  BackIcon,
  LinkIcon,
  ListIcon,
  PlusIcon,
  QuizIcon,
  TagIcon,
  TrashIcon,
} from "@/views/revision/revision-icons.view";

export type NotebookTab = "notes" | "tools";

/** Limits the notes list to one passage, after its note count is clicked. */
export interface PassageFilter {
  readonly documentId: number;
  readonly start: number;
}

interface NotebookPaneProps {
  readonly tab: NotebookTab;
  readonly notes: readonly StudyNote[];
  readonly openNote: StudyNote | null;
  readonly passageFilter: PassageFilter | null;
  readonly sources: ReadonlyMap<number, RevisionSource>;
  readonly reader: ReaderDocument | null;
  readonly analysing: boolean;
  readonly now: number;
  readonly onTab: (tab: NotebookTab) => void;
  readonly onOpenNote: (note: StudyNote) => void;
  readonly onCloseNote: () => void;
  readonly onNewNote: () => void;
  /** Resolves to an error message, or null once saved. */
  readonly onSaveNote: (noteId: number, title: string, body: string) => Promise<string | null>;
  readonly onDeleteNote: (note: StudyNote) => void;
  readonly onOpenPassage: (documentId: number, sentence: number) => void;
  readonly onClearPassageFilter: () => void;
  readonly onAnalyse: () => void;
  readonly onFindTerm: (term: string) => void;
  /** Opens the document's full saved analysis. */
  readonly onReadAnalysis: () => void;
  readonly onTakeQuiz: (quiz: RevisionQuiz) => void;
}

type SaveStatus = "saved" | "saving" | "error";

function NoteEditor({
  note,
  sourceTitle,
  now,
  onSave,
  onBack,
  onDelete,
  onOpenPassage,
}: {
  readonly note: StudyNote;
  readonly sourceTitle: string | null;
  readonly now: number;
  readonly onSave: (noteId: number, title: string, body: string) => Promise<string | null>;
  readonly onBack: () => void;
  readonly onDelete: () => void;
  readonly onOpenPassage: (documentId: number, sentence: number) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<{ title: string; body: string } | null>(null);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Save anything still waiting when the editor closes.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);

      if (pending.current) {
        void onSaveRef.current(note.id, pending.current.title, pending.current.body);
        pending.current = null;
      }
    },
    [note.id],
  );

  async function flush() {
    const value = pending.current;

    if (!value) {
      return;
    }

    pending.current = null;
    const failure = await onSaveRef.current(note.id, value.title, value.body);

    // Newer typing is already queued; its own save will report.
    if (pending.current) {
      return;
    }

    setStatus(failure ? "error" : "saved");
    setError(failure);
  }

  function schedule(next: { title: string; body: string }) {
    pending.current = next;
    setStatus("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), revisionRules.noteAutosaveMs);
  }

  const statusText =
    status === "saving"
      ? "Saving…"
      : status === "error"
        ? (error ?? "Not saved")
        : `Saved · ${formatNoteTime(note.updatedAt, now)}`;

  return (
    <div className="rev-note-editor">
      <div className="rev-note-editor-bar">
        <button className="rev-icon-button" type="button" onClick={onBack} aria-label="Back to notes">
          <BackIcon />
        </button>
        <span className={`rev-save-status ${status}`} role="status">
          {statusText}
        </span>
        <button className="rev-icon-button danger" type="button" onClick={onDelete} aria-label="Delete note">
          <TrashIcon />
        </button>
      </div>

      <div className="rev-note-editor-body">
        <label className="visually-hidden" htmlFor={`note-title-${note.id}`}>
          Note title
        </label>
        <input
          id={`note-title-${note.id}`}
          className="rev-note-title-input"
          type="text"
          value={title}
          maxLength={revisionRules.noteTitleMaxLength}
          placeholder="Untitled note"
          onChange={(event) => {
            setTitle(event.target.value);
            schedule({ title: event.target.value, body });
          }}
        />

        {note.quote ? (
          note.documentId !== null && note.sentenceIndex !== null ? (
            <button
              className="rev-note-quote"
              type="button"
              onClick={() => onOpenPassage(note.documentId!, note.sentenceIndex!)}
            >
              <span className="rev-note-quote-label">{sourceTitle ?? "Source"} · open passage</span>
              <span className="rev-note-quote-text">“{note.quote}”</span>
            </button>
          ) : (
            <div className="rev-note-quote static">
              <span className="rev-note-quote-label">From a deleted document</span>
              <span className="rev-note-quote-text">“{note.quote}”</span>
            </div>
          )
        ) : null}

        <label className="visually-hidden" htmlFor={`note-body-${note.id}`}>
          Note
        </label>
        <textarea
          id={`note-body-${note.id}`}
          className="rev-note-textarea"
          value={body}
          maxLength={revisionRules.noteBodyMaxLength}
          placeholder="Write it in your own words…"
          onChange={(event) => {
            setBody(event.target.value);
            schedule({ title, body: event.target.value });
          }}
        />
      </div>
    </div>
  );
}

function StudyTools({
  reader,
  analysing,
  onAnalyse,
  onOpenPassage,
  onFindTerm,
  onReadAnalysis,
  onTakeQuiz,
}: Pick<
  NotebookPaneProps,
  "reader" | "analysing" | "onAnalyse" | "onOpenPassage" | "onFindTerm" | "onReadAnalysis" | "onTakeQuiz"
>) {
  if (!reader) {
    return (
      <div className="rev-empty-small">
        <p>Open a document to see its key points, saved analysis and quizzes.</p>
      </div>
    );
  }

  const running = analysing || reader.analysisRunning;

  return (
    <div className="rev-tools">
      <p className="rev-tools-scope">For {reader.title}</p>

      <section className="rev-tool-card">
        <header>
          <span className="rev-tool-icon gold">
            <ListIcon />
          </span>
          <span>
            <strong>Key points</strong>
            <small>Important sentences found by content analysis</small>
          </span>
        </header>
        {reader.analysis && reader.analysis.keyPoints.length > 0 ? (
          <>
            <ol className="rev-key-points">
              {reader.analysis.keyPoints.map((point) => (
                <li key={point.index}>
                  <button type="button" onClick={() => onOpenPassage(reader.id, point.index)}>
                    {point.text}
                  </button>
                </li>
              ))}
            </ol>
            <button className="rev-small-button" type="button" onClick={onReadAnalysis}>
              Read full analysis
            </button>
          </>
        ) : running ? (
          <p className="rev-tool-note">Analysing this document… this can take a minute.</p>
        ) : (
          <div className="rev-tool-cta">
            <p className="rev-tool-note">Find the key sentences and terms, and mark them in the text.</p>
            <button className="button button-dark" type="button" onClick={onAnalyse}>
              Find key points
            </button>
          </div>
        )}
      </section>

      {reader.analysis && reader.analysis.keyTerms.length > 0 ? (
        <section className="rev-tool-card">
          <header>
            <span className="rev-tool-icon blue">
              <TagIcon />
            </span>
            <span>
              <strong>Key terms</strong>
              <small>Click a term to find it in the text</small>
            </span>
          </header>
          <ul className="rev-term-list">
            {reader.analysis.keyTerms.map((term) => (
              <li key={term}>
                <button type="button" onClick={() => onFindTerm(term)}>
                  {term}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rev-tool-card">
        <header>
          <span className="rev-tool-icon red">
            <QuizIcon />
          </span>
          <span>
            <strong>Practice quizzes</strong>
            <small>{reader.quizzes.length > 0 ? "Saved from this document" : "None saved yet"}</small>
          </span>
          <Link className="rev-small-button gold rev-tool-header-action" href={`/quizzes?documentId=${reader.id}`}>
            Make a quiz
          </Link>
        </header>
        {reader.quizzes.length > 0 ? (
          <ul className="rev-quiz-list">
            {reader.quizzes.map((quiz) => (
              <li key={quiz.id}>
                <span className="rev-quiz-text">
                  <strong>{quiz.title}</strong>
                  <small>
                    {quiz.questionCount} questions · {quiz.difficulty}
                    {quiz.bestPercentage !== null
                      ? ` · best ${quiz.bestPercentage}% (${quiz.attempts} ${quiz.attempts === 1 ? "try" : "tries"})`
                      : " · not tried yet"}
                  </small>
                </span>
                <button className="rev-small-button" type="button" onClick={() => onTakeQuiz(quiz)}>
                  {quiz.attempts > 0 ? "Retake" : "Take"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

export function NotebookPane({
  tab,
  notes,
  openNote,
  passageFilter,
  sources,
  reader,
  analysing,
  now,
  onTab,
  onOpenNote,
  onCloseNote,
  onNewNote,
  onSaveNote,
  onDeleteNote,
  onOpenPassage,
  onClearPassageFilter,
  onAnalyse,
  onFindTerm,
  onReadAnalysis,
  onTakeQuiz,
}: NotebookPaneProps) {
  const listed = passageFilter
    ? notes.filter(
        (note) => note.documentId === passageFilter.documentId && note.sentenceIndex === passageFilter.start,
      )
    : notes;

  return (
    <section className="rev-pane rev-notebook" aria-label="Notebook">
      <div className="rev-tabs" role="tablist" aria-label="Notebook">
        <button
          className={tab === "notes" ? "rev-tab active" : "rev-tab"}
          type="button"
          role="tab"
          aria-selected={tab === "notes"}
          onClick={() => onTab("notes")}
        >
          My notes <span className="rev-tab-count">{notes.length}</span>
        </button>
        <button
          className={tab === "tools" ? "rev-tab active" : "rev-tab"}
          type="button"
          role="tab"
          aria-selected={tab === "tools"}
          onClick={() => onTab("tools")}
        >
          Study tools
        </button>
      </div>

      {tab === "tools" ? (
        <StudyTools
          reader={reader}
          analysing={analysing}
          onAnalyse={onAnalyse}
          onOpenPassage={onOpenPassage}
          onFindTerm={onFindTerm}
          onReadAnalysis={onReadAnalysis}
          onTakeQuiz={onTakeQuiz}
        />
      ) : openNote ? (
        <NoteEditor
          key={openNote.id}
          note={openNote}
          sourceTitle={openNote.documentId === null ? null : (sources.get(openNote.documentId)?.title ?? null)}
          now={now}
          onSave={onSaveNote}
          onBack={onCloseNote}
          onDelete={() => onDeleteNote(openNote)}
          onOpenPassage={onOpenPassage}
        />
      ) : (
        <div className="rev-notes">
          <div className="rev-notes-actions">
            <button className="rev-new-note" type="button" onClick={onNewNote}>
              <PlusIcon />
              New note
            </button>
          </div>

          {passageFilter ? (
            <p className="rev-notes-filter">
              Notes on this passage ·{" "}
              <button className="text-action" type="button" onClick={onClearPassageFilter}>
                Show all notes
              </button>
            </p>
          ) : null}

          {listed.length > 0 ? (
            <ul className="rev-note-list">
              {listed.map((note) => {
                const source = note.documentId === null ? null : sources.get(note.documentId);

                return (
                  <li key={note.id}>
                    <button className="rev-note-card" type="button" onClick={() => onOpenNote(note)}>
                      <span className="rev-note-card-top">
                        <strong>{noteDisplayTitle(note)}</strong>
                        <time dateTime={note.updatedAt}>{formatNoteTime(note.updatedAt, now)}</time>
                      </span>
                      <span className="rev-note-card-snippet">{noteSnippet(note)}</span>
                      {source ? (
                        <span className="rev-note-card-source">
                          <LinkIcon />
                          {source.title}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rev-empty-small">
              <p>
                No notes here yet. Hover a passage in the reader and choose “Add to note”, or start a
                blank note.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
