"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  revisionHref,
  revisionRules,
  subjectColours,
  type ReaderDocument,
  type RevisionActionState,
  type RevisionAnalysis,
  type RevisionDashboardModel,
  type RevisionSource,
  type StudyNote,
  type StudySubject,
  type SubjectColour,
} from "@/models/revision/revision.model";
import { NotebookPane, type NotebookTab, type PassageFilter } from "@/views/revision/notebook-pane.view";
import { ReaderPane, type ReaderFocus } from "@/views/revision/reader-pane.view";
import {
  RevisionConfirmDialog,
  SubjectDialog,
  type RevisionConfirmRequest,
  type SubjectFormRequest,
} from "@/views/revision/revision-dialog.view";
import { FlameIcon, PlayIcon, QuizIcon, UploadIcon } from "@/views/revision/revision-icons.view";
import { SourcesPane, type SubjectFilter } from "@/views/revision/sources-pane.view";

/** Server Actions the workspace calls; supplied by the route. */
export interface RevisionActions {
  openDocument(documentId: number): Promise<RevisionActionState<ReaderDocument>>;
  createSubject(name: string, colour: string): Promise<RevisionActionState<StudySubject>>;
  renameSubject(subjectId: number, name: string): Promise<RevisionActionState>;
  deleteSubject(subjectId: number): Promise<RevisionActionState>;
  moveDocument(documentId: number, subjectId: number | null): Promise<RevisionActionState>;
  createNote(input: {
    readonly subjectId: number | null;
    readonly documentId: number | null;
    readonly sentenceIndex: number | null;
    readonly quote: string | null;
    readonly title: string;
  }): Promise<RevisionActionState<StudyNote>>;
  updateNote(noteId: number, title: string, body: string): Promise<RevisionActionState<StudyNote>>;
  deleteNote(noteId: number): Promise<RevisionActionState>;
  setHighlight(documentId: number, sentenceIndex: number, on: boolean): Promise<RevisionActionState>;
  recordProgress(documentId: number, sentenceIndex: number): Promise<number | null>;
  analyse(documentId: number): Promise<RevisionActionState<RevisionAnalysis>>;
}

interface RevisionWorkspaceProps {
  readonly model: RevisionDashboardModel;
  readonly actions: RevisionActions;
}

const genericError = "Something went wrong. Please try again.";
const weekMs = 7 * 24 * 60 * 60 * 1000;

function sortSubjects(list: readonly StudySubject[]): StudySubject[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

export function RevisionWorkspace({ model, actions }: RevisionWorkspaceProps) {
  const [subjects, setSubjects] = useState<readonly StudySubject[]>(model.subjects);
  const [sources, setSources] = useState<readonly RevisionSource[]>(model.sources);
  const [notes, setNotes] = useState<readonly StudyNote[]>(model.notes);
  const [reader, setReader] = useState<ReaderDocument | null>(model.reader);
  const [filter, setFilter] = useState<SubjectFilter>("all");
  const [tab, setTab] = useState<NotebookTab>("notes");
  const [openNoteId, setOpenNoteId] = useState<number | null>(null);
  const [passageFilter, setPassageFilter] = useState<PassageFilter | null>(null);
  const [focus, setFocus] = useState<ReaderFocus | null>(
    model.reader && model.reader.lastSentence > 0
      ? { sentence: model.reader.lastSentence, flash: false, key: 0 }
      : null,
  );
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<RevisionConfirmRequest | null>(null);
  const [subjectForm, setSubjectForm] = useState<SubjectFormRequest | null>(null);
  const [streak, setStreak] = useState({ days: model.streakDays, today: model.revisedToday });
  // Starts from the server's clock so the first render matches hydration.
  const [now, setNow] = useState(() => Date.parse(model.generatedAt));

  const focusKey = useRef(1);
  const progressTimer = useRef<number | undefined>(undefined);
  const pendingProgress = useRef<{ documentId: number; sentence: number } | null>(null);
  const lastSavedProgress = useRef("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const sourcesById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  const highlights = useMemo(() => new Set(reader?.highlights ?? []), [reader]);
  const noteCounts = useMemo(() => {
    const counts = new Map<number, number>();

    for (const note of notes) {
      if (reader && note.documentId === reader.id && note.sentenceIndex !== null) {
        counts.set(note.sentenceIndex, (counts.get(note.sentenceIndex) ?? 0) + 1);
      }
    }

    return counts;
  }, [notes, reader]);

  const visibleNotes = filter === "all" ? notes : notes.filter((note) => note.subjectId === filter);
  const openNote = notes.find((note) => note.id === openNoteId) ?? null;
  const openSource = reader ? sourcesById.get(reader.id) : undefined;
  const continueSource = sources
    .filter((source) => source.status === "ready" && source.progressUpdatedAt && source.progressPercent < 100)
    .sort((a, b) => Date.parse(b.progressUpdatedAt!) - Date.parse(a.progressUpdatedAt!))[0];
  const notesThisWeek = notes.filter((note) => now - Date.parse(note.createdAt) < weekMs).length;

  function markActivity() {
    setStreak((current) => (current.today ? current : { days: current.days + 1, today: true }));
  }

  function jumpTo(sentence: number, flash = true) {
    focusKey.current += 1;
    setFocus({ sentence, flash, key: focusKey.current });
  }

  async function openDocument(documentId: number, target?: { sentence: number; flash: boolean }) {
    if (reader?.id === documentId) {
      if (target) {
        jumpTo(target.sentence, target.flash);
      }
      return;
    }

    setLoadingId(documentId);

    try {
      const result = await actions.openDocument(documentId);

      if (!result.value) {
        setNotice(result.error ?? genericError);
        return;
      }

      const opened = result.value;
      setReader(opened);
      setPassageFilter(null);
      window.history.replaceState(null, "", revisionHref(documentId));

      // Resume where the student stopped, unless a passage was asked for.
      const sentence = target?.sentence ?? opened.lastSentence;

      if (target || sentence > 0) {
        jumpTo(sentence, target?.flash ?? false);
      } else {
        setFocus(null);
      }
    } catch {
      setNotice(genericError);
    } finally {
      setLoadingId(null);
    }
  }

  const saveProgress = useCallback(async () => {
    const pending = pendingProgress.current;

    if (!pending) {
      return;
    }

    const key = `${pending.documentId}:${pending.sentence}`;

    if (key === lastSavedProgress.current) {
      return;
    }

    lastSavedProgress.current = key;
    const percent = await actions.recordProgress(pending.documentId, pending.sentence);

    if (percent === null) {
      return;
    }

    const updatedAt = new Date().toISOString();
    setSources((list) =>
      list.map((source) =>
        source.id === pending.documentId
          ? { ...source, progressPercent: percent, lastSentence: pending.sentence, progressUpdatedAt: updatedAt }
          : source,
      ),
    );
    setStreak((current) => (current.today ? current : { days: current.days + 1, today: true }));
  }, [actions]);

  // Save the reading position still waiting when the student leaves the page.
  useEffect(
    () => () => {
      window.clearTimeout(progressTimer.current);
      void saveProgress();
    },
    [saveProgress],
  );

  const readerId = reader?.id ?? null;
  const handleProgress = useCallback(
    (sentence: number) => {
      if (readerId === null) {
        return;
      }

      pendingProgress.current = { documentId: readerId, sentence };
      window.clearTimeout(progressTimer.current);
      progressTimer.current = window.setTimeout(() => void saveProgress(), revisionRules.progressSaveMs);
    },
    [readerId, saveProgress],
  );

  async function toggleHighlight(start: number) {
    if (!reader) {
      return;
    }

    const documentId = reader.id;
    const on = !highlights.has(start);
    const apply = (value: boolean) =>
      setReader((current) =>
        current && current.id === documentId
          ? {
              ...current,
              highlights: value
                ? [...current.highlights, start]
                : current.highlights.filter((index) => index !== start),
            }
          : current,
      );

    apply(on);
    const result = await actions.setHighlight(documentId, start, on).catch(() => ({ error: genericError }));

    if (result.error) {
      apply(!on);
      setNotice(result.error);
    } else if (on) {
      markActivity();
    }
  }

  async function createNote(passage: { start: number; text: string } | null) {
    const documentSubject = reader ? (sourcesById.get(reader.id)?.subjectId ?? null) : null;
    const result = await actions
      .createNote({
        subjectId: filter !== "all" ? filter : passage ? documentSubject : null,
        documentId: passage && reader ? reader.id : null,
        sentenceIndex: passage ? passage.start : null,
        quote: passage ? passage.text : null,
        title: "",
      })
      .catch(() => ({ error: genericError }) as RevisionActionState<StudyNote>);

    if (!result.value) {
      setNotice(result.error ?? genericError);
      return;
    }

    const note = result.value;
    setNotes((list) => [note, ...list]);
    setTab("notes");
    setPassageFilter(null);
    setOpenNoteId(note.id);
    markActivity();
  }

  const saveNote = useCallback(
    async (noteId: number, title: string, body: string) => {
      const result = await actions
        .updateNote(noteId, title, body)
        .catch(() => ({ error: "Your note could not be saved. Check your connection." }) as RevisionActionState<StudyNote>);

      if (!result.value) {
        return result.error ?? genericError;
      }

      const saved = result.value;
      setNotes((list) => [saved, ...list.filter((note) => note.id !== noteId)]);
      setStreak((current) => (current.today ? current : { days: current.days + 1, today: true }));
      return null;
    },
    [actions],
  );

  function deleteNote(note: StudyNote) {
    setConfirm({
      title: "Delete this note?",
      body: "The note will be removed for good. The document it came from is not affected.",
      confirmLabel: "Delete note",
      onConfirm: async () => {
        const result = await actions.deleteNote(note.id).catch(() => ({ error: genericError }));

        if (result.error) {
          setNotice(result.error);
          return;
        }

        setNotes((list) => list.filter((item) => item.id !== note.id));
        setOpenNoteId((current) => (current === note.id ? null : current));
      },
    });
  }

  function createSubject() {
    setSubjectForm({
      mode: "create",
      name: "",
      colour: subjectColours[subjects.length % subjectColours.length],
      onSubmit: async (name: string, colour: SubjectColour) => {
        const result = await actions.createSubject(name, colour).catch(() => ({ error: genericError }) as RevisionActionState<StudySubject>);

        if (!result.value) {
          return result.error ?? genericError;
        }

        const subject = result.value;
        setSubjects((list) => sortSubjects([...list, subject]));
        setFilter(subject.id);
        return null;
      },
    });
  }

  function renameSubject(subject: StudySubject) {
    setSubjectForm({
      mode: "rename",
      name: subject.name,
      colour: subject.colour,
      onSubmit: async (name: string) => {
        const result = await actions.renameSubject(subject.id, name).catch(() => ({ error: genericError }));

        if (result.error) {
          return result.error;
        }

        const trimmed = name.trim().replace(/\s+/g, " ");
        setSubjects((list) => sortSubjects(list.map((item) => (item.id === subject.id ? { ...item, name: trimmed } : item))));
        return null;
      },
    });
  }

  function deleteSubject(subject: StudySubject) {
    setConfirm({
      title: `Delete “${subject.name}”?`,
      body: "Its documents and notes are kept. They just won’t belong to a subject any more.",
      confirmLabel: "Delete subject",
      onConfirm: async () => {
        const result = await actions.deleteSubject(subject.id).catch(() => ({ error: genericError }));

        if (result.error) {
          setNotice(result.error);
          return;
        }

        setSubjects((list) => list.filter((item) => item.id !== subject.id));
        setSources((list) => list.map((item) => (item.subjectId === subject.id ? { ...item, subjectId: null } : item)));
        setNotes((list) => list.map((item) => (item.subjectId === subject.id ? { ...item, subjectId: null } : item)));
        setFilter((current) => (current === subject.id ? "all" : current));
      },
    });
  }

  async function moveDocument(source: RevisionSource, subjectId: number | null) {
    const previous = source.subjectId;
    const apply = (value: number | null) =>
      setSources((list) => list.map((item) => (item.id === source.id ? { ...item, subjectId: value } : item)));

    apply(subjectId);
    const result = await actions.moveDocument(source.id, subjectId).catch(() => ({ error: genericError }));

    if (result.error) {
      apply(previous);
      setNotice(result.error);
      return;
    }

    const subject = subjects.find((item) => item.id === subjectId);
    setNotice(subject ? `Moved to ${subject.name}.` : "Removed from its subject.");
  }

  async function analyse() {
    if (!reader) {
      return;
    }

    const documentId = reader.id;
    setAnalysing(true);

    try {
      const result = await actions.analyse(documentId);

      if (!result.value) {
        setNotice(result.error ?? genericError);
        return;
      }

      // Reload so the key sentences are marked in the text as well.
      const refreshed = await actions.openDocument(documentId);

      if (refreshed.value) {
        const updated = refreshed.value;
        setReader((current) => (current?.id === documentId ? updated : current));
      }
    } catch {
      setNotice(genericError);
    } finally {
      setAnalysing(false);
    }
  }

  function findTerm(term: string) {
    const needle = term.toLowerCase();
    const match = reader?.blocks.find(
      (block) =>
        block.kind === "passage" &&
        block.sentences.some((sentence) => sentence.text.toLowerCase().includes(needle)),
    );

    if (match && match.kind === "passage") {
      jumpTo(match.start);
    } else {
      setNotice(`“${term}” does not appear word for word in the text.`);
    }
  }

  return (
    <div className="rev-workspace-wrap">
      <section className="rev-today" aria-label="Today">
        <div className="rev-today-greeting">
          <p>Welcome back, {model.viewerName}</p>
          <h1>{continueSource ? "Pick up where you left off" : "Your revision space"}</h1>
        </div>

        {continueSource ? (
          <button
            className="rev-today-item"
            type="button"
            onClick={() => void openDocument(continueSource.id, { sentence: continueSource.lastSentence, flash: true })}
          >
            <span className="rev-today-icon dark">
              <PlayIcon />
            </span>
            <span>
              <strong>Continue reading</strong>
              <small>
                {continueSource.title} · {continueSource.progressPercent}% read
              </small>
            </span>
          </button>
        ) : null}

        <div className="rev-today-item static gold">
          <span className="rev-today-icon">
            <FlameIcon />
          </span>
          <span>
            <strong>{streak.days > 0 ? `${streak.days}-day streak` : "Start a streak"}</strong>
            <small>{streak.today ? "You revised today" : "Read or write a note today"}</small>
          </span>
        </div>

        <div className="rev-today-item static">
          <span>
            <strong>
              {notesThisWeek} note{notesThisWeek === 1 ? "" : "s"}
            </strong>
            <small>written this week</small>
          </span>
        </div>

        <Link className="rev-today-item" href="/documents">
          <span className="rev-today-icon">
            <UploadIcon />
          </span>
          <span>
            <strong>Upload</strong>
            <small>Add notes or slides</small>
          </span>
        </Link>

        <Link className="rev-today-item" href={reader ? `/quizzes?documentId=${reader.id}` : "/quizzes"}>
          <span className="rev-today-icon">
            <QuizIcon />
          </span>
          <span>
            <strong>Practice quiz</strong>
            <small>{reader ? "On the open document" : "Generate questions"}</small>
          </span>
        </Link>
      </section>

      <div className="rev-workspace">
        <SourcesPane
          subjects={subjects}
          filter={filter}
          allSources={sources}
          openId={reader?.id ?? null}
          loadingId={loadingId}
          onFilter={setFilter}
          onOpen={(source) => void openDocument(source.id)}
          onMove={(source, subjectId) => void moveDocument(source, subjectId)}
          onCreateSubject={createSubject}
          onRenameSubject={renameSubject}
          onDeleteSubject={deleteSubject}
        />

        <ReaderPane
          reader={reader}
          loading={loadingId !== null}
          hasSources={sources.length > 0}
          highlights={highlights}
          noteCounts={noteCounts}
          progressPercent={openSource?.progressPercent ?? reader?.progressPercent ?? 0}
          focus={focus}
          onToggleHighlight={(start) => void toggleHighlight(start)}
          onAddNote={(start, text) => void createNote({ start, text })}
          onNewNote={() => void createNote(null)}
          onShowNotes={(start) => {
            if (reader) {
              setTab("notes");
              setOpenNoteId(null);
              setPassageFilter({ documentId: reader.id, start });
            }
          }}
          onProgress={handleProgress}
        />

        <NotebookPane
          tab={tab}
          notes={visibleNotes}
          openNote={openNote}
          passageFilter={passageFilter}
          sources={sourcesById}
          reader={reader}
          analysing={analysing}
          now={now}
          onTab={setTab}
          onOpenNote={(note) => setOpenNoteId(note.id)}
          onCloseNote={() => setOpenNoteId(null)}
          onNewNote={() => void createNote(null)}
          onSaveNote={saveNote}
          onDeleteNote={deleteNote}
          onOpenPassage={(documentId, sentence) => void openDocument(documentId, { sentence, flash: true })}
          onClearPassageFilter={() => setPassageFilter(null)}
          onAnalyse={() => void analyse()}
          onFindTerm={findTerm}
        />
      </div>

      <RevisionConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <SubjectDialog request={subjectForm} onClose={() => setSubjectForm(null)} />

      {notice ? (
        <div className="rev-toast" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
