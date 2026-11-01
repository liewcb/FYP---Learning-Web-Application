import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ChatAttachmentStorage,
  ChatAttachmentUpload,
  ChatDocumentCopy,
  StoredChatAttachment,
} from "@/interfaces/services/chat-attachment-storage.interface";

const chatAttachmentsBucket = "chat-attachments";
const learningMaterialsBucket = "learning-materials";
const signedUrlLifetimeSeconds = 60 * 60;
const downloadUrlLifetimeSeconds = 60;

function safeFileName(fileName: string): string {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-120);

  return cleaned || "chat-attachment";
}

// The conversation id must be the first path segment because Storage RLS
// checks that the uploader belongs to that conversation.
function attachmentPath(conversationId: number, fileName: string): string {
  return `${conversationId}/${randomUUID()}-${safeFileName(fileName)}`;
}

export class SupabaseChatAttachmentStorage implements ChatAttachmentStorage {
  constructor(private readonly supabase: SupabaseClient) {}

  async upload(input: ChatAttachmentUpload): Promise<StoredChatAttachment> {
    const { data, error } = await this.supabase.storage
      .from(chatAttachmentsBucket)
      .upload(attachmentPath(input.conversationId, input.fileName), input.body, {
        cacheControl: "3600",
        contentType: input.mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Unable to upload chat attachment: ${error.message}`);
    }

    return { path: data.path };
  }

  async copyFromDocument(input: ChatDocumentCopy): Promise<StoredChatAttachment> {
    const path = attachmentPath(input.conversationId, input.fileName);
    const copied = await this.supabase.storage
      .from(learningMaterialsBucket)
      .copy(input.sourcePath, path, { destinationBucket: chatAttachmentsBucket });

    if (!copied.error) {
      return { path };
    }

    // Fall back to download and re-upload if a cross-bucket copy is refused.
    const downloaded = await this.supabase.storage
      .from(learningMaterialsBucket)
      .download(input.sourcePath);

    if (downloaded.error) {
      throw new Error(`Unable to share document into chat: ${downloaded.error.message}`);
    }

    const { data, error } = await this.supabase.storage
      .from(chatAttachmentsBucket)
      .upload(path, downloaded.data, {
        cacheControl: "3600",
        contentType: input.mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Unable to share document into chat: ${error.message}`);
    }

    return { path: data.path };
  }

  async remove(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }

    const { error } = await this.supabase.storage
      .from(chatAttachmentsBucket)
      .remove([...paths]);

    if (error) {
      throw new Error(`Unable to remove chat attachment: ${error.message}`);
    }
  }

  async download(path: string): Promise<Blob> {
    const { data, error } = await this.supabase.storage
      .from(chatAttachmentsBucket)
      .download(path);

    if (error) {
      throw new Error(`Unable to read chat attachment: ${error.message}`);
    }

    return data;
  }

  async createPreviewUrl(path: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(chatAttachmentsBucket)
      .createSignedUrl(path, signedUrlLifetimeSeconds);

    if (error) {
      throw new Error(`Unable to open chat attachment: ${error.message}`);
    }

    return data.signedUrl;
  }

  async createDownloadUrl(path: string, fileName: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(chatAttachmentsBucket)
      .createSignedUrl(path, downloadUrlLifetimeSeconds, { download: fileName });

    if (error) {
      throw new Error(`Unable to download chat attachment: ${error.message}`);
    }

    return data.signedUrl;
  }
}
