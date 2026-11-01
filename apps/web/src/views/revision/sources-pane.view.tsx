"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  documentKind,
  type RevisionSource,
  type StudySubject,
} from "@/models/revision/revision.model";
import {
  CheckIcon,
  ChevronDownIcon,
  MoreIcon,
  PlusIcon,
} from "@/views/revision/revision-icons.view";

export type SubjectFilter = number | "all";

interface SourcesPaneProps {
  readonly subjects: readonly StudySubject[];
  readonly filter: SubjectFilter;
  readonly allSources: readonly RevisionSource[];
  readonly openId: number | null;
  readonly loadingId: number | null;
  readonly onFilter: (filter: SubjectFilter) => void;
  readonly onOpen: (source: RevisionSource) => void;
  readonly onMove: (source: RevisionSource, subjectId: number | null) => void;
  readonly onCreateSubject: () => void;
  readonly onRenameSubject: (subject: StudySubject) => void;
  readonly onDeleteSubject: (subject: StudySubject) => void;
}

/** Closes a popup menu on an outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        close();
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return ref;
}

function statusLine(source: RevisionSource): string {
  switch (source.status) {
    case "uploaded":
    case "processing":
      return "Extracting text…";
    case "failed":
      return "Text extraction failed";
    case "ready": {
      const read =
        source.progressPercent >= 100
          ? "Read"
          : source.progressPercent > 0
            ? `${source.progressPercent}% read`
            : "Not started";
      return source.pageCount ? `${read} · ${source.pageCount} pages` : read;
    }
  }
}

function SubjectDot({ subject }: { readonly subject: StudySubject | null }) {
  return (
    <span className={`rev-subject-dot ${subject?.colour ?? "none"}`} aria-hidden="true">
      {subject ? subject.name.slice(0, 1).toUpperCase() : "A"}
    </span>
  );
}

function SubjectSwitcher({
  subjects,
  filter,
  allSources,
  onFilter,
  onCreateSubject,
  onRenameSubject,
  onDeleteSubject,
}: Pick<
  SourcesPaneProps,
  "subjects" | "filter" | "allSources" | "onFilter" | "onCreateSubject" | "onRenameSubject" | "onDeleteSubject"
>) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const current = filter === "all" ? null : (subjects.find((subject) => subject.id === filter) ?? null);
  const count = (subjectId: number | null) =>
    allSources.filter((source) => subjectId === null || source.subjectId === subjectId).length;

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="rev-switcher" ref={ref}>
      <button
        className="rev-switcher-button"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <SubjectDot subject={current} />
        <span className="rev-switcher-label">{current ? current.name : "All subjects"}</span>
        <ChevronDownIcon />
      </button>

      {open ? (
        <div className="rev-menu rev-switcher-menu" role="menu">
          <button type="button" role="menuitemradio" aria-checked={filter === "all"} onClick={() => choose(() => onFilter("all"))}>
            <SubjectDot subject={null} />
            <span>All subjects</span>
            <small>{count(null)}</small>
          </button>
          {subjects.map((subject) => (
            <button
              key={subject.id}
              type="button"
              role="menuitemradio"
              aria-checked={filter === subject.id}
              onClick={() => choose(() => onFilter(subject.id))}
            >
              <SubjectDot subject={subject} />
              <span>{subject.name}</span>
              <small>{count(subject.id)}</small>
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" onClick={() => choose(onCreateSubject)}>
            <span className="rev-menu-icon">
              <PlusIcon />
            </span>
            <span>New subject</span>
          </button>
          {current ? (
            <>
              <button type="button" role="menuitem" onClick={() => choose(() => onRenameSubject(current))}>
                <span className="rev-menu-icon" />
                <span>Rename “{current.name}”</span>
              </button>
              <button type="button" role="menuitem" className="danger" onClick={() => choose(() => onDeleteSubject(current))}>
                <span className="rev-menu-icon" />
                <span>Delete “{current.name}”</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MoveMenu({
  source,
  subjects,
  onMove,
}: {
  readonly source: RevisionSource;
  readonly subjects: readonly StudySubject[];
  readonly onMove: (source: RevisionSource, subjectId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  function choose(subjectId: number | null) {
    setOpen(false);

    if (subjectId !== source.subjectId) {
      onMove(source, subjectId);
    }
  }

  const option = (subjectId: number | null, label: ReactNode, key: string) => (
    <button key={key} type="button" role="menuitemradio" aria-checked={source.subjectId === subjectId} onClick={() => choose(subjectId)}>
      <span className="rev-menu-icon">{source.subjectId === subjectId ? <CheckIcon /> : null}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div className={open ? "rev-row-menu open" : "rev-row-menu"} ref={ref}>
      <button
        className="rev-icon-button small"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Move ${source.title} to a subject`}
        title="Move to subject"
      >
        <MoreIcon />
      </button>
      {open ? (
        <div className="rev-menu rev-row-menu-list" role="menu">
          <p className="rev-menu-heading">Move to subject</p>
          {option(null, "No subject", "none")}
          {subjects.map((subject) => option(subject.id, subject.name, String(subject.id)))}
        </div>
      ) : null}
    </div>
  );
}

export function SourcesPane({
  subjects,
  filter,
  allSources,
  openId,
  loadingId,
  onFilter,
  onOpen,
  onMove,
  onCreateSubject,
  onRenameSubject,
  onDeleteSubject,
}: SourcesPaneProps) {
  const sources =
    filter === "all" ? allSources : allSources.filter((source) => source.subjectId === filter);

  return (
    <section className="rev-pane rev-sources" aria-label="Sources">
      <header className="rev-pane-header">
        <div className="rev-pane-title-row">
          <h2>Sources</h2>
          <Link className="rev-small-button" href="/documents">
            <PlusIcon />
            Add
          </Link>
        </div>
        <SubjectSwitcher
          subjects={subjects}
          filter={filter}
          allSources={allSources}
          onFilter={onFilter}
          onCreateSubject={onCreateSubject}
          onRenameSubject={onRenameSubject}
          onDeleteSubject={onDeleteSubject}
        />
      </header>

      {sources.length > 0 ? (
        <ul className="rev-source-list">
          {sources.map((source) => {
            const ready = source.status === "ready";
            const classes = [
              "rev-source",
              source.id === openId ? "open" : null,
              ready ? null : "unavailable",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <li key={source.id} className={classes}>
                <button
                  className="rev-source-open"
                  type="button"
                  onClick={() => onOpen(source)}
                  disabled={!ready}
                  aria-current={source.id === openId ? "true" : undefined}
                  aria-busy={loadingId === source.id}
                >
                  <span className={`rev-file-badge ${documentKind(source.mimeType).toLowerCase()}`} aria-hidden="true">
                    {documentKind(source.mimeType)}
                  </span>
                  <span className="rev-source-text">
                    <span className="rev-source-title">{source.title}</span>
                    <span className="rev-source-meta">
                      {loadingId === source.id ? "Opening…" : statusLine(source)}
                    </span>
                    {ready && source.progressPercent > 0 ? (
                      <span className="rev-progress small" aria-hidden="true">
                        <span style={{ width: `${source.progressPercent}%` }} />
                      </span>
                    ) : null}
                  </span>
                </button>
                {subjects.length > 0 ? (
                  <MoveMenu source={source} subjects={subjects} onMove={onMove} />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rev-empty-small">
          {allSources.length === 0 ? (
            <>
              <p>Upload your lecture notes or slides to start revising here.</p>
              <Link className="button button-dark" href="/documents">
                Upload a document
              </Link>
            </>
          ) : (
            <p>No documents in this subject yet. Use ⋯ on a document to move it here.</p>
          )}
        </div>
      )}

      <footer className="rev-pane-footer">
        <Link href="/documents">Upload</Link>
        <Link href="/documents/manage">Manage documents</Link>
        <Link href="/chats">Files from Chats</Link>
      </footer>
    </section>
  );
}
