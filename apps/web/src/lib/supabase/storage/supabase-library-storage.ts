import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  LibraryFileCopy,
  LibraryStorage,
  StoredLibraryFile,
} from "@/interfaces/services/library-storage.interface";

const libraryBucket = "library-materials";
const learningMaterialsBucket = "learning-materials";
const downloadUrlLifetimeSeconds = 60;

function safeFileName(fileName: string): string {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-120);

  return cleaned || "library-material";
}

/**
 * The library bucket has no browser policies, so every operation uses the
 * service-role client. Callers must check access first.
 */
export class SupabaseLibraryStorage implements LibraryStorage {
  constructor(private readonly createServiceClient: () => SupabaseClient) {}

  async copyFromDocument(input: LibraryFileCopy): Promise<StoredLibraryFile> {
    const storage = this.createServiceClient().storage;
    const path = `${input.submitterId}/${randomUUID()}-${safeFileName(input.fileName)}`;
    const copied = await storage
      .from(learningMaterialsBucket)
      .copy(input.sourcePath, path, { destinationBucket: libraryBucket });

    if (!copied.error) {
      return { path };
    }

    // Fall back to download and upload if a cross-bucket copy is refused.
    const downloaded = await storage.from(learningMaterialsBucket).download(input.sourcePath);

    if (downloaded.error) {
      throw new Error(`Unable to copy document to the library: ${downloaded.error.message}`);
    }

    const { data, error } = await storage.from(libraryBucket).upload(path, downloaded.data, {
      cacheControl: "3600",
      contentType: input.mimeType,
      upsert: false,
    });

    if (error) {
      throw new Error(`Unable to copy document to the library: ${error.message}`);
    }

    return { path: data.path };
  }

  async remove(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }

    const { error } = await this.createServiceClient().storage.from(libraryBucket).remove([...paths]);

    if (error) {
      throw new Error(`Unable to remove library file: ${error.message}`);
    }
  }

  async createDownloadUrl(path: string, fileName: string): Promise<string> {
    const { data, error } = await this.createServiceClient()
      .storage.from(libraryBucket)
      .createSignedUrl(path, downloadUrlLifetimeSeconds, { download: fileName });

    if (error) {
      throw new Error(`Unable to download library file: ${error.message}`);
    }

    return data.signedUrl;
  }
}