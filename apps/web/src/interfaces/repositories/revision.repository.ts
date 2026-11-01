import type {
  CreateStudyNoteInput,
  ReadingProgress,
  RevisionAnalysis,
  StudyNote,
  StudySubject,
  SubjectColour,
  UpdateStudyNoteInput,
} from "@/models/revision/revision.model";

/** The signed-in student's revision data. Every row is owner-only. */
export interface RevisionRepository {
  listSubjects(): Promise<StudySubject[]>;
  createSubject(ownerId: string, name: string, colour: SubjectColour): Promise<StudySubject>;
  renameSubject(subjectId: number, name: string): Promise<void>;
  /** Its documents and notes stay, without a subject. */
  deleteSubject(subjectId: number): Promise<void>;
  /** Subject of each of the student's documents, by document id. */
  listDocumentSubjects(): Promise<Map<number, number | null>>;
  setDocumentSubject(documentId: number, subjectId: number | null): Promise<void>;

  listNotes(limit: number): Promise<StudyNote[]>;
  createNote(input: CreateStudyNoteInput): Promise<StudyNote>;
  updateNote(noteId: number, input: UpdateStudyNoteInput): Promise<StudyNote>;
  deleteNote(noteId: number): Promise<void>;

  /** Start sentence of each highlighted passage. */
  listHighlights(documentId: number): Promise<number[]>;
  addHighlight(ownerId: string, documentId: number, sentenceIndex: number): Promise<void>;
  removeHighlight(documentId: number, sentenceIndex: number): Promise<void>;

  listProgress(): Promise<ReadingProgress[]>;
  /** Returns the new percentage read, or null when it could not be saved. */
  recordProgress(documentId: number, sentenceIndex: number): Promise<number | null>;
  /** Days with revision activity, newest first, as YYYY-MM-DD. */
  listActivityDays(limit: number): Promise<string[]>;

  /** The newest finished content analysis, or null; `running` while one is in progress. */
  findLatestAnalysis(documentId: number): Promise<{
    readonly analysis: RevisionAnalysis | null;
    readonly running: boolean;
  }>;
}
