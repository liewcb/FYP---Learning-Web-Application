import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ForumAttachmentStorage,
  ForumAttachmentUpload,
  StoredForumAttachment,
} from "@/interfaces/services/forum-attachment-storage.interface";

const forumAttachmentsBucket = "forum-attachments";
const signedUrlLifetimeSeconds = 60 * 60;

function safeFileName(fileName: string): string {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-120);

  return cleaned || "forum-attachment";
}

export class SupabaseForumAttachmentStorage implements ForumAttachmentStorage {
  constructor(private readonly supabase: SupabaseClient) {}

  async upload(input: ForumAttachmentUpload): Promise<StoredForumAttachment> {
    // The user id must be the first path segment because Storage RLS checks it.
    const path = `${input.ownerId}/${input.threadId}/${randomUUID()}-${safeFileName(input.fileName)}`;
    const { data, error } = await this.supabase.storage
      .from(forumAttachmentsBucket)
      .upload(path, input.body, {
        cacheControl: "3600",
        contentType: input.mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Unable to upload forum attachment: ${error.message}`);
    }

    return { path: data.path };
  }

  async remove(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }

    const { error } = await this.supabase.storage
      .from(forumAttachmentsBucket)
      .remove([...paths]);

    if (error) {
      throw new Error(`Unable to remove forum attachment: ${error.message}`);
    }
  }

  async createSignedUrl(path: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(forumAttachmentsBucket)
      .createSignedUrl(path, signedUrlLifetimeSeconds);

    if (error) {
      throw new Error(`Unable to open forum attachment: ${error.message}`);
    }

    return data.signedUrl;
  }
}
