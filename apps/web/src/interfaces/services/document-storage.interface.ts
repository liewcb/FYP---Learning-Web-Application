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
  /** Short-lived link that downloads the file under its original name. */
  createDownloadUrl(path: string, fileName: string): Promise<string>;
  /** Short-lived link that opens the file in the browser instead. */
  createViewUrl(path: string): Promise<string>;
}
