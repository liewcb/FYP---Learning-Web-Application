import type { DocumentStatus } from "@/models/document/document.model";

export const subjectColours = ["navy", "gold", "green", "blue", "red", "purple"] as const;

export type SubjectColour = (typeof subjectColours)[number];

export function isSubjectColour(value: unknown): value is SubjectColour {
  return typeof value === "string" && (subjectColours as readonly string[]).includes(value);
}

export const revisionRules = {
  subjectNameMaxLength: 60,
  noteTitleMaxLength: 200,
  noteBodyMaxLength: 20_000,
  quoteMaxLength: 1_000,
  /** Sentences grouped into one readable passage in the reader. */
  passageSentences: 4,
  maxNotes: 500,
  noteAutosaveMs: 800,
  progressSaveMs: 2_000,
  streakLookbackDays: 120,
} as const;

/** Malaysian time, so "today" and dates match on the server and in the browser. */
export const revisionTimeZone = "Asia/Kuala_Lumpur";

export interface StudySubject {
  readonly id: number;
  readonly name: string;
  readonly colour: SubjectColour;
}

export interface ReadingProgress {
  readonly documentId: number;
  readonly lastSentence: number;
  readonly percent: number;
  readonly updatedAt: string;
}

/** A document in the Sources pane. */
export interface RevisionSource {
  readonly id: number;
  readonly title: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly status: DocumentStatus;
  readonly subjectId: number | null;
  readonly pageCount: number | null;
  readonly sentenceCount: number | null;
  readonly progressPercent: number;
  readonly lastSentence: number;
  readonly progressUpdatedAt: string | null;
  readonly createdAt: string;
}

export interface ReaderSentence {
  readonly index: number;
  readonly text: string;
  /** Picked as important by content analysis. */
  readonly key: boolean;
}

export type ReaderBlock =
  | { readonly kind: "heading"; readonly index: number; readonly text: string }
  | { readonly kind: "passage"; readonly start: number; readonly sentences: readonly ReaderSentence[] };

export interface RevisionKeyPoint {
  readonly index: number;
  readonly text: string;
}

/** The latest saved content analysis of a document. */
export interface RevisionAnalysis {
  readonly keyPoints: readonly RevisionKeyPoint[];
  readonly keyTerms: readonly string[];
  readonly analysedAt: string | null;
}

export interface ReaderDocument {
  readonly id: number;
  readonly title: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly pageCount: number | null;
  readonly sentenceCount: number;
  readonly blocks: readonly ReaderBlock[];
  /** Start sentence of each highlighted passage. */
  readonly highlights: readonly number[];
  readonly progressPercent: number;
  readonly lastSentence: number;
  readonly analysis: RevisionAnalysis | null;
  /** An analysis is being prepared right now. */
  readonly analysisRunning: boolean;
}

export interface StudyNote {
  readonly id: number;
  readonly subjectId: number | null;
  readonly documentId: number | null;
  readonly sentenceIndex: number | null;
  readonly quote: string | null;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateStudyNoteInput {
  readonly ownerId: string;
  readonly subjectId: number | null;
  readonly documentId: number | null;
  readonly sentenceIndex: number | null;
  readonly quote: string | null;
  readonly title: string;
  readonly body: string;
}

export interface UpdateStudyNoteInput {
  readonly title: string;
  readonly body: string;
}

export interface RevisionDashboardModel {
  readonly viewerName: string;
  readonly generatedAt: string;
  readonly subjects: readonly StudySubject[];
  readonly sources: readonly RevisionSource[];
  readonly notes: readonly StudyNote[];
  readonly reader: ReaderDocument | null;
  readonly streakDays: number;
  readonly revisedToday: boolean;
}

/** Results of workspace actions. */
export interface RevisionActionState<T = undefined> {
  readonly error?: string;
  readonly value?: T;
}

/** Slide titles and section headings: short lines with no closing punctuation. */
export function isHeadingSentence(text: string): boolean {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).length;

  return (
    trimmed.length > 0 &&
    trimmed.length <= 80 &&
    words <= 10 &&
    !/[.!?;:,"”')\]]$/.test(trimmed) &&
    /^[\p{Lu}\p{N}]/u.test(trimmed)
  );
}

/**
 * Groups extracted sentences into headings and short passages. Passages are
 * addressed by their first sentence index, which highlights and notes store.
 */
export function buildReaderBlocks(
  sentences: readonly string[],
  keyIndexes: ReadonlySet<number>,
): ReaderBlock[] {
  const blocks: ReaderBlock[] = [];
  let passage: ReaderSentence[] = [];

  const flush = () => {
    if (passage.length > 0) {
      blocks.push({ kind: "passage", start: passage[0].index, sentences: passage });
      passage = [];
    }
  };

  sentences.forEach((text, index) => {
    if (isHeadingSentence(text) && !keyIndexes.has(index)) {
      flush();
      blocks.push({ kind: "heading", index, text: text.trim() });
      return;
    }

    passage.push({ index, text, key: keyIndexes.has(index) });

    if (passage.length >= revisionRules.passageSentences) {
      flush();
    }
  });

  flush();

  return blocks;
}

export function passageText(block: Extract<ReaderBlock, { kind: "passage" }>): string {
  return block.sentences.map((sentence) => sentence.text).join(" ");
}

export function quoteFromText(text: string): string {
  const trimmed = text.trim();

  return trimmed.length > revisionRules.quoteMaxLength
    ? `${trimmed.slice(0, revisionRules.quoteMaxLength - 1)}…`
    : trimmed;
}

export function progressPercent(lastIndex: number, sentenceCount: number): number {
  if (sentenceCount <= 0) {
    return 0;
  }

  return Math.min(100, Math.floor(((lastIndex + 1) * 100) / sentenceCount));
}

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: revisionTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayKey(time: number): string {
  return dayKeyFormatter.format(new Date(time));
}

/**
 * Consecutive days with revision activity ending today, or ending yesterday
 * when nothing has been done yet today (the streak is still alive).
 */
export function revisionStreak(
  days: readonly string[],
  now: number,
): { readonly days: number; readonly today: boolean } {
  const active = new Set(days);
  const dayMs = 24 * 60 * 60 * 1000;
  const today = active.has(dayKey(now));
  let cursor = today ? now : now - dayMs;
  let count = 0;

  while (active.has(dayKey(cursor))) {
    count += 1;
    cursor -= dayMs;
  }

  return { days: count, today };
}

const noteTimeFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: revisionTimeZone,
  hour: "numeric",
  minute: "2-digit",
});
const noteDateFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: revisionTimeZone,
  day: "numeric",
  month: "short",
});

/** "Today, 9:42 pm", "Yesterday" or "28 Oct". */
export function formatNoteTime(iso: string, now: number): string {
  const time = Date.parse(iso);
  const dayMs = 24 * 60 * 60 * 1000;

  if (dayKey(time) === dayKey(now)) {
    return `Today, ${noteTimeFormatter.format(new Date(time))}`;
  }

  if (dayKey(time) === dayKey(now - dayMs)) {
    return "Yesterday";
  }

  return noteDateFormatter.format(new Date(time));
}

export function noteSnippet(note: Pick<StudyNote, "body">): string {
  return note.body.trim() || "Empty note";
}

export function noteDisplayTitle(note: Pick<StudyNote, "title">): string {
  return note.title.trim() || "Untitled note";
}

export function validateSubjectName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim().replace(/\s+/g, " ");

  if (!name) {
    return { ok: false, error: "Give the subject a name." };
  }

  if (name.length > revisionRules.subjectNameMaxLength) {
    return { ok: false, error: `Subject names can be up to ${revisionRules.subjectNameMaxLength} characters.` };
  }

  return { ok: true, name };
}

export function validateNote(input: UpdateStudyNoteInput): string | null {
  if (input.title.length > revisionRules.noteTitleMaxLength) {
    return `Titles can be up to ${revisionRules.noteTitleMaxLength} characters.`;
  }

  if (input.body.length > revisionRules.noteBodyMaxLength) {
    return `Notes can be up to ${revisionRules.noteBodyMaxLength.toLocaleString("en-MY")} characters.`;
  }

  return null;
}

export function documentKind(mimeType: string): "PDF" | "DOCX" {
  return mimeType === "application/pdf" ? "PDF" : "DOCX";
}

export function revisionHref(documentId: number): string {
  return `/?doc=${documentId}`;
}

export function parseRevisionId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
