import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DocumentFileUpload,
  DocumentStorage,
  StoredDocumentFile,
} from "@/interfaces/services/document-storage.interface";

const learningMaterialsBucket = "learning-materials";
const downloadUrlLifetimeSeconds = 60;

function safeFileName(fileName: string): string {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-120);

  return cleaned || "learning-material";
}

export class SupabaseDocumentStorage implements DocumentStorage {
  constructor(private readonly supabase: SupabaseClient) {}

  async upload(input: DocumentFileUpload): Promise<StoredDocumentFile> {
    // The first path segment is checked by the storage RLS policy.
    const path = `${input.ownerId}/${randomUUID()}-${safeFileName(input.fileName)}`;
    const { data, error } = await this.supabase.storage
      .from(learningMaterialsBucket)
      .upload(path, input.body, {
        cacheControl: "3600",
        contentType: input.mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Unable to upload document: ${error.message}`);
    }

    return { path: data.path };
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.supabase.storage
      .from(learningMaterialsBucket)
      .remove([path]);

    if (error) {
      throw new Error(`Unable to remove document: ${error.message}`);
    }
  }

  async createDownloadUrl(path: string, fileName: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(learningMaterialsBucket)
      .createSignedUrl(path, downloadUrlLifetimeSeconds, { download: fileName });

    if (error) {
      throw new Error(`Unable to open document: ${error.message}`);
    }

    return data.signedUrl;
  }
}
