import type { SupabaseClient } from "@supabase/supabase-js";

import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import {
  LearningDocument,
  type CreateDocumentInput,
  type DocumentContent,
  type DocumentContentSummary,
  type DocumentRecord,
  type DocumentStatus,
} from "@/models/document/document.model";

// Only the statistics are embedded in listings; the full text can be large.
const documentColumns =
  "*, document_contents(sentence_count, word_count, character_count, page_count, warnings)";

interface ContentSummaryRow {
  sentence_count: number;
  word_count: number;
  character_count: number;
  page_count: number | null;
  warnings: string[];
}

interface ContentRow extends ContentSummaryRow {
  document_id: number;
  extracted_text: string;
  sentences: string[];
  language_code: string;
  extracted_at: string;
}

interface DocumentRow {
  id: number;
  owner_id: string;
  title: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  // PostgREST embeds a one-to-one relation as an object; older versions use an array.
  document_contents?: ContentSummaryRow | ContentSummaryRow[] | null;
}

function toContentSummary(row: ContentSummaryRow): DocumentContentSummary {
  return {
    sentenceCount: row.sentence_count,
    wordCount: row.word_count,
    characterCount: row.character_count,
    pageCount: row.page_count,
    warnings: row.warnings,
  };
}

function embeddedContentSummary(
  embedded: DocumentRow["document_contents"],
): DocumentContentSummary | null {
  const row = Array.isArray(embedded) ? embedded[0] : embedded;

  return row ? toContentSummary(row) : null;
}

function toModel(row: DocumentRow): LearningDocument {
  const record: DocumentRecord = {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    content: embeddedContentSummary(row.document_contents),
  };

  return new LearningDocument(record);
}

export class SupabaseDocumentRepository implements DocumentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listForCurrentUser(): Promise<LearningDocument[]> {
    const { data, error } = await this.supabase
      .from("documents")
      .select(documentColumns)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Unable to load documents: ${error.message}`);
    }

    return (data as DocumentRow[]).map(toModel);
  }

  async findById(id: number): Promise<LearningDocument | null> {
    const { data, error } = await this.supabase
      .from("documents")
      .select(documentColumns)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load document: ${error.message}`);
    }

    return data ? toModel(data as DocumentRow) : null;
  }

  async findContent(documentId: number): Promise<DocumentContent | null> {
    const { data, error } = await this.supabase
      .from("document_contents")
      .select(
        "document_id, extracted_text, sentences, language_code, sentence_count, word_count, character_count, page_count, warnings, extracted_at",
      )
      .eq("document_id", documentId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load document content: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const row = data as ContentRow;

    return {
      ...toContentSummary(row),
      documentId: row.document_id,
      text: row.extracted_text,
      sentences: row.sentences,
      languageCode: row.language_code,
      extractedAt: row.extracted_at,
    };
  }

  async create(input: CreateDocumentInput): Promise<LearningDocument> {
    const { data, error } = await this.supabase
      .from("documents")
      .insert({
        owner_id: input.ownerId,
        title: input.title,
        file_name: input.fileName,
        storage_path: input.storagePath,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(`Unable to create document: ${error.message}`);
    }

    return toModel(data as DocumentRow);
  }

  async updateTitle(id: number, title: string): Promise<void> {
    const { error } = await this.supabase
      .from("documents")
      .update({ title })
      .eq("id", id);

    if (error) {
      throw new Error(`Unable to rename document: ${error.message}`);
    }
  }

  async delete(id: number): Promise<void> {
    // Analyses, extracted content and quizzes cascade with the document row.
    const { error } = await this.supabase.from("documents").delete().eq("id", id);

    if (error) {
      throw new Error(`Unable to delete document: ${error.message}`);
    }
  }

  async updateStatus(
    id: number,
    status: DocumentStatus,
    errorMessage: string | null = null,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("documents")
      .update({ status, error_message: errorMessage })
      .eq("id", id);

    if (error) {
      throw new Error(`Unable to update document: ${error.message}`);
    }
  }
}
