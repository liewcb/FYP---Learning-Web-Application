"use server";

import {
  createProfileController,
  createRevisionController,
} from "@/lib/dependencies/server";
import type { SavedContentAnalysis } from "@/models/analysis/content-analysis.model";
import type { Viewer } from "@/models/profile/profile.model";
import type { SavedQuiz } from "@/models/quiz/quiz.model";
import {
  highlightRules,
  isHighlightColour,
  parseTextRange,
  type HighlightColour,
  type StudyHighlight,
  type TextRange,
} from "@/models/revision/highlight.model";
import {
  parseRevisionId,
  type ReaderDocument,
  type RevisionActionState,
  type RevisionAnalysis,
  type StudyNote,
  type StudySubject,
} from "@/models/revision/revision.model";

const signedOut = { error: "Your session expired. Sign in and try again." } as const;
const notFound = { error: "This item could not be found." } as const;

// Server Actions are public entry points, so every action checks the account.
async function currentStudent(): Promise<Viewer | null> {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  return viewer?.role === "student" ? viewer : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalId(value: unknown): number | null {
  return value === null || value === undefined ? null : parseRevisionId(value);
}

export async function openRevisionDocumentAction(
  documentId: number,
): Promise<RevisionActionState<ReaderDocument>> {
  const id = parseRevisionId(documentId);

  if (id === null) {
    return notFound;
  }

  if (!(await currentStudent())) {
    return signedOut;
  }

  return (await createRevisionController()).openDocument(id);
}

export async function createSubjectAction(
  name: string,
  colour: string,
): Promise<RevisionActionState<StudySubject>> {
  const viewer = await currentStudent();

  if (!viewer) {
    return signedOut;
  }

  return (await createRevisionController()).createSubject(viewer.id, text(name), text(colour));
}

export async function renameSubjectAction(subjectId: number, name: string): Promise<RevisionActionState> {
  const id = parseRevisionId(subjectId);

  if (id === null) {
    return notFound;
  }

  if (!(await currentStudent())) {
    return signedOut;
  }

  return (await createRevisionController()).renameSubject(id, text(name));
}

export async function deleteSubjectAction(subjectId: number): Promise<RevisionActionState> {
  const id = parseRevisionId(subjectId);

  if (id === null) {
    return notFound;
  }

  if (!(await currentStudent())) {
    return signedOut;
  }

  return (await createRevisionController()).deleteSubject(id);
}

export async function moveDocumentToSubjectAction(
  documentId: number,
  subjectId: number | null,
): Promise<RevisionActionState> {
  const id = parseRevisionId(documentId);
  const subject = optionalId(subjectId);

  if (id === null || (subjectId !== null && subject === null)) {
    return notFound;
  }

  if (!(await currentStudent())) {
    return signedOut;
  }

  return (await createRevisionController()).moveDocument(id, subject);
}

export async function createNoteAction(input: {
  readonly subjectId: number | null;
  readonly documentId: number | null;
  readonly sentenceIndex: number | null;
  readonly quote: string | null;
  readonly title: string;
}): Promise<RevisionActionState<StudyNote>> {
  const viewer = await currentStudent();

  if (!viewer) {
    return signedOut;
  }

  const sentence =
    typeof input?.sentenceIndex === "number" && Number.isSafeInteger(input.sentenceIndex) && input.sentenceIndex >= 0
      ? input.sentenceIndex
      : null;

  return (await createRevisionController()).createNote({
    ownerId: viewer.id,
    subjectId: optionalId(input?.subjectId),
    documentId: optionalId(input?.documentId),
    sentenceIndex: sentence,
    quote: typeof input?.quote === "string" ? input.quote : null,
    title: text(input?.title),
  });
}

export async function updateNoteAction(
  noteId: number,
  title: string,
  body: string,
): Promise<RevisionActionState<StudyNote>> {
  const id = parseRevisionId(noteId);

  if (id === null) {
    return notFound;
  }

  if (!(await currentStudent())) {
    return signedOut;
  }

  return (await createRevisionController()).updateNote(id, { title: text(title), body: text(body) });
}

export async function deleteNoteAction(noteId: number): Promise<RevisionActionState> {
  const id = parseRevisionId(noteId);

  if (id === null) {
    return notFound;
  }

  if (!(await currentStudent())) {
    return signedOut;
  }

  return (await createRevisionController()).deleteNote(id);
}

export async function addHighlightAction(
  documentId: number,
  range: TextRange,
  colour: HighlightColour,
): Promise<RevisionActionState<StudyHighlight>> {
  const id = parseRevisionId(documentId);
  const parsedRange = parseTextRange(range);

  if (id === null) {
    return notFound;
  }

  if (!parsedRange || !isHighlightColour(colour)) {
    return { error: "Select some text to highlight." };
  }

  const viewer = await currentStudent();

  if (!viewer) {
    return signedOut;
  }

  return (await createRevisionController()).addHighlight({
    ownerId: viewer.id,
    documentId: id,
    range: parsedRange,
    colour,
  });
}

export async function recolourHighlightAction(
  highlightId: number,
  colour: HighlightColour,
): Promise<RevisionActionState> {
  const id = parseRevisionId(highlightId);

  if (id === null || !isHighlightColour(colour)) {
    return notFound;
  }

  if (!(await currentStudent())) {
    return signedOut;
  }

  return (await createRevisionController()).recolourHighlight(id, colour);
}

export async function removeHighlightsAction(highlightIds: readonly number[]): Promise<RevisionActionState> {
  const ids = Array.isArray(highlightIds) ? highlightIds.map((id) => parseRevisionId(id)) : [];

  if (ids.length === 0 || ids.length > highlightRules.maxRemovedAtOnce || ids.some((id) => id === null)) {
    return notFound;
  }

  if (!(await currentStudent())) {
    return signedOut;
  }

  return (await createRevisionController()).removeHighlights(ids as number[]);
}

export async function recordReadingProgressAction(
  documentId: number,
  sentenceIndex: number,
): Promise<number | null> {
  const id = parseRevisionId(documentId);

  if (id === null || !Number.isSafeInteger(sentenceIndex) || sentenceIndex < 0 || !(await currentStudent())) {
    return null;
  }

  return (await createRevisionController()).recordProgress(id, sentenceIndex);
}

export async function analyseRevisionDocumentAction(
  documentId: number,
): Promise<RevisionActionState<RevisionAnalysis>> {
  const id = parseRevisionId(documentId);

  if (id === null) {
    return notFound;
  }

  if (!(await currentStudent())) {
    return signedOut;
  }

  return (await createRevisionController()).analyse(id);
}

/** The full saved analysis of a document, opened from the dashboard. */
export async function loadSavedAnalysisAction(
  documentId: number,
): Promise<RevisionActionState<SavedContentAnalysis>> {
  const id = parseRevisionId(documentId);

  if (id === null) {
    return notFound;
  }

  if (!(await currentStudent())) {
    return signedOut;
  }

  return (await createRevisionController()).savedAnalysis(id);
}

/** A saved quiz to take on the dashboard; answers stay on the server. */
export async function loadSavedQuizAction(quizId: number): Promise<RevisionActionState<SavedQuiz>> {
  const id = parseRevisionId(quizId);

  if (id === null) {
    return notFound;
  }

  if (!(await currentStudent())) {
    return signedOut;
  }

  return (await createRevisionController()).savedQuiz(id);
}
