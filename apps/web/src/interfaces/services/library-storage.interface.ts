export interface LibraryFileCopy {
  readonly submitterId: string;
  /** Path in the learning-materials bucket. */
  readonly sourcePath: string;
  readonly fileName: string;
  readonly mimeType: string;
}

export interface StoredLibraryFile {
  readonly path: string;
}

/** Private-file operations required by the library use case. */
export interface LibraryStorage {
  /** Copies a student's document so the original stays private. */
  copyFromDocument(input: LibraryFileCopy): Promise<StoredLibraryFile>;
  remove(paths: readonly string[]): Promise<void>;
  /** Short-lived link that downloads the file under its original name. */
  createDownloadUrl(path: string, fileName: string): Promise<string>;
}