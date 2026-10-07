import type { SupabaseClient } from "@supabase/supabase-js";

import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import {
  LearningDocument,
  type CreateDocumentInput,
  type DocumentRecord,
  type DocumentStatus,
} from "@/models/document/document.model";

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
  };

  return new LearningDocument(record);
}

export class SupabaseDocumentRepository implements DocumentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listForCurrentUser(): Promise<LearningDocument[]> {
    const { data, error } = await this.supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Unable to load documents: ${error.message}`);
    }

    return (data as DocumentRow[]).map(toModel);
  }

  async findById(id: number): Promise<LearningDocument | null> {
    const { data, error } = await this.supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load document: ${error.message}`);
    }

    return data ? toModel(data as DocumentRow) : null;
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
