export interface ChatAttachmentUpload {
  readonly conversationId: number;
  readonly fileName: string;
  readonly mimeType: string;
  readonly body: Blob;
}

export interface ChatDocumentCopy {
  readonly conversationId: number;
  /** Path of the student's own file in the learning-materials bucket. */
  readonly sourcePath: string;
  readonly fileName: string;
  readonly mimeType: string;
}

export interface StoredChatAttachment {
  readonly path: string;
}

/** Private-file operations required by the chat use case. */
export interface ChatAttachmentStorage {
  upload(input: ChatAttachmentUpload): Promise<StoredChatAttachment>;
  /** Copies a document so the original in My Documents stays private. */
  copyFromDocument(input: ChatDocumentCopy): Promise<StoredChatAttachment>;
  remove(paths: readonly string[]): Promise<void>;
  /** The file's contents, e.g. to save a received document to My Documents. */
  download(path: string): Promise<Blob>;
  /** Short-lived link for showing an image inline. */
  createPreviewUrl(path: string): Promise<string>;
  /** Short-lived link that downloads the file under its original name. */
  createDownloadUrl(path: string, fileName: string): Promise<string>;
}
