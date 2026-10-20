export interface ForumAttachmentUpload {
  readonly ownerId: string;
  readonly threadId: number;
  readonly fileName: string;
  readonly mimeType: string;
  readonly body: Blob;
}

export interface StoredForumAttachment {
  readonly path: string;
}

/** Private-file operations required by the forum use case. */
export interface ForumAttachmentStorage {
  upload(input: ForumAttachmentUpload): Promise<StoredForumAttachment>;
  remove(paths: readonly string[]): Promise<void>;
  createSignedUrl(path: string): Promise<string>;
}
