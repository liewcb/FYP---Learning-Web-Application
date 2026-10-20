export interface StoredDocumentFile {
  readonly path: string;
}

export interface DocumentFileUpload {
  readonly ownerId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly body: Blob;
}

/** Private-file operations required by the documents use case. */
export interface DocumentStorage {
  upload(input: DocumentFileUpload): Promise<StoredDocumentFile>;
  remove(path: string): Promise<void>;
}
