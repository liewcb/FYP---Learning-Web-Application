import type { SupabaseClient } from "@supabase/supabase-js";

import type { RevisionRepository } from "@/interfaces/repositories/revision.repository";
import {
  isSubjectColour,
  type CreateStudyNoteInput,
  type ReadingProgress,
  type RevisionAnalysis,
  type StudyNote,
  type StudySubject,
  type SubjectColour,
  type UpdateStudyNoteInput,
} from "@/models/revision/revision.model";

interface SubjectRow {
  id: number;
  name: string;
  colour: string;
}

interface NoteRow {
  id: number;
  subject_id: number | null;
  document_id: number | null;
  sentence_index: number | null;
  quote: string | null;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface ProgressRow {
  document_id: number;
  last_sentence: number;
  furthest_sentence: number;
  sentence_count: number;
  updated_at: string;
}

interface AnalysisRow {
  status: string;
  important_sentences: unknown;
  semantic_keywords: unknown;
  baseline_keywords: unknown;
  completed_at: string | null;
  created_at: string;
}

const noteColumns =
  "id, subject_id, document_id, sentence_index, quote, title, body, created_at, updated_at";
const maxKeyTerms = 12;
/** A pending analysis older than this is treated as abandoned. */
const staleAnalysisMs = 10 * 60 * 1000;

function toSubject(row: SubjectRow): StudySubject {
  return {
    id: row.id,
    name: row.name,
    colour: isSubjectColour(row.colour) ? row.colour : "navy",
  };
}

function toNote(row: NoteRow): StudyNote {
  return {
    id: row.id,
    subjectId: row.subject_id,
    documentId: row.document_id,
    sentenceIndex: row.sentence_index,
    quote: row.quote,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProgress(row: ProgressRow): ReadingProgress {
  return {
    documentId: row.document_id,
    lastSentence: row.last_sentence,
    percent: Math.min(100, Math.floor(((row.furthest_sentence + 1) * 100) / row.sentence_count)),
    updatedAt: row.updated_at,
  };
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
}

/** Key points in reading order and up to 12 distinct key terms. */
function toAnalysis(row: AnalysisRow): RevisionAnalysis {
  const keyPoints = records(row.important_sentences)
    .flatMap((item) =>
      typeof item.text === "string" && typeof item.original_index === "number"
        ? [{ index: item.original_index, text: item.text }]
        : [],
    )
    .sort((a, b) => a.index - b.index);

  const seen = new Set<string>();
  const keyTerms: string[] = [];

  for (const item of [...records(row.semantic_keywords), ...records(row.baseline_keywords)]) {
    const term = typeof item.term === "string" ? item.term.trim() : "";

    if (term && !seen.has(term.toLowerCase()) && keyTerms.length < maxKeyTerms) {
      seen.add(term.toLowerCase());
      keyTerms.push(term);
    }
  }

  return { keyPoints, keyTerms, analysedAt: row.completed_at };
}

export class SupabaseRevisionRepository implements RevisionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listSubjects(): Promise<StudySubject[]> {
    const { data, error } = await this.supabase
      .from("study_subjects")
      .select("id, name, colour")
      .order("name");

    if (error) {
      throw new Error(`Unable to load subjects: ${error.message}`);
    }

    return (data as SubjectRow[]).map(toSubject);
  }

  async createSubject(ownerId: string, name: string, colour: SubjectColour): Promise<StudySubject> {
    const { data, error } = await this.supabase
      .from("study_subjects")
      .insert({ owner_id: ownerId, name, colour })
      .select("id, name, colour")
      .single();

    if (error) {
      throw new Error(
        error.code === "23505" ? "duplicate_subject" : `Unable to create subject: ${error.message}`,
      );
    }

    return toSubject(data as SubjectRow);
  }

  async renameSubject(subjectId: number, name: string): Promise<void> {
    const { error } = await this.supabase.from("study_subjects").update({ name }).eq("id", subjectId);

    if (error) {
      throw new Error(
        error.code === "23505" ? "duplicate_subject" : `Unable to rename subject: ${error.message}`,
      );
    }
  }

  async deleteSubject(subjectId: number): Promise<void> {
    const { error } = await this.supabase.from("study_subjects").delete().eq("id", subjectId);

    if (error) {
      throw new Error(`Unable to delete subject: ${error.message}`);
    }
  }

  async listDocumentSubjects(): Promise<Map<number, number | null>> {
    const { data, error } = await this.supabase.from("documents").select("id, subject_id");

    if (error) {
      throw new Error(`Unable to load document subjects: ${error.message}`);
    }

    return new Map(
      (data as { id: number; subject_id: number | null }[]).map((row) => [row.id, row.subject_id]),
    );
  }

  async setDocumentSubject(documentId: number, subjectId: number | null): Promise<void> {
    const { error } = await this.supabase
      .from("documents")
      .update({ subject_id: subjectId })
      .eq("id", documentId);

    if (error) {
      throw new Error(`Unable to move document: ${error.message}`);
    }
  }

  async listNotes(limit: number): Promise<StudyNote[]> {
    const { data, error } = await this.supabase
      .from("study_notes")
      .select(noteColumns)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Unable to load notes: ${error.message}`);
    }

    return (data as NoteRow[]).map(toNote);
  }

  async createNote(input: CreateStudyNoteInput): Promise<StudyNote> {
    const { data, error } = await this.supabase
      .from("study_notes")
      .insert({
        owner_id: input.ownerId,
        subject_id: input.subjectId,
        document_id: input.documentId,
        sentence_index: input.sentenceIndex,
        quote: input.quote,
        title: input.title,
        body: input.body,
      })
      .select(noteColumns)
      .single();

    if (error) {
      throw new Error(`Unable to create note: ${error.message}`);
    }

    return toNote(data as NoteRow);
  }

  async updateNote(noteId: number, input: UpdateStudyNoteInput): Promise<StudyNote> {
    const { data, error } = await this.supabase
      .from("study_notes")
      .update({ title: input.title, body: input.body })
      .eq("id", noteId)
      .select(noteColumns)
      .single();

    if (error) {
      throw new Error(`Unable to save note: ${error.message}`);
    }

    return toNote(data as NoteRow);
  }

  async deleteNote(noteId: number): Promise<void> {
    const { error } = await this.supabase.from("study_notes").delete().eq("id", noteId);

    if (error) {
      throw new Error(`Unable to delete note: ${error.message}`);
    }
  }

  async listHighlights(documentId: number): Promise<number[]> {
    const { data, error } = await this.supabase
      .from("study_highlights")
      .select("sentence_index")
      .eq("document_id", documentId);

    if (error) {
      throw new Error(`Unable to load highlights: ${error.message}`);
    }

    return (data as { sentence_index: number }[]).map((row) => row.sentence_index);
  }

  async addHighlight(ownerId: string, documentId: number, sentenceIndex: number): Promise<void> {
    const { error } = await this.supabase
      .from("study_highlights")
      .upsert(
        { owner_id: ownerId, document_id: documentId, sentence_index: sentenceIndex },
        { onConflict: "owner_id,document_id,sentence_index", ignoreDuplicates: true },
      );

    if (error) {
      throw new Error(`Unable to save highlight: ${error.message}`);
    }
  }

  async removeHighlight(documentId: number, sentenceIndex: number): Promise<void> {
    const { error } = await this.supabase
      .from("study_highlights")
      .delete()
      .eq("document_id", documentId)
      .eq("sentence_index", sentenceIndex);

    if (error) {
      throw new Error(`Unable to remove highlight: ${error.message}`);
    }
  }

  async listProgress(): Promise<ReadingProgress[]> {
    const { data, error } = await this.supabase
      .from("reading_progress")
      .select("document_id, last_sentence, furthest_sentence, sentence_count, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(`Unable to load reading progress: ${error.message}`);
    }

    return (data as ProgressRow[]).map(toProgress);
  }

  async recordProgress(documentId: number, sentenceIndex: number): Promise<number | null> {
    const { data, error } = await this.supabase.rpc("record_reading_progress", {
      p_document: documentId,
      p_sentence: sentenceIndex,
    });

    if (error) {
      throw new Error(`Unable to save reading progress: ${error.message}`);
    }

    return typeof data === "number" ? data : null;
  }

  async listActivityDays(limit: number): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("study_activity")
      .select("day")
      .order("day", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Unable to load revision activity: ${error.message}`);
    }

    return (data as { day: string }[]).map((row) => row.day);
  }

  async findLatestAnalysis(documentId: number): Promise<{
    readonly analysis: RevisionAnalysis | null;
    readonly running: boolean;
  }> {
    const { data, error } = await this.supabase
      .from("document_analyses")
      .select("status, important_sentences, semantic_keywords, baseline_keywords, completed_at, created_at")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      throw new Error(`Unable to load content analysis: ${error.message}`);
    }

    const rows = data as AnalysisRow[];
    const ready = rows.find((row) => row.status === "ready");
    const running = rows.some(
      (row) =>
        (row.status === "pending" || row.status === "processing") &&
        Date.now() - Date.parse(row.created_at) < staleAnalysisMs &&
        (!ready || Date.parse(row.created_at) > Date.parse(ready.created_at)),
    );

    return { analysis: ready ? toAnalysis(ready) : null, running };
  }
}
