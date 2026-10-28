export const documentStatuses = [
  "uploaded",
  "processing",
  "ready",
  "failed",
] as const;

export type DocumentStatus = (typeof documentStatuses)[number];

export const documentUploadRules = {
  maxBytes: 25 * 1024 * 1024,
  maxTitleLength: 200,
  allowedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
} as const;

export const documentProcessingRules = {
  /**
   * A document left in "processing" this long belongs to a crashed worker and
   * may be retried. Keep in sync with STALE_PROCESSING_AFTER in the AI service.
   */
  staleAfterMs: 10 * 60 * 1000,
  /**
   * The upload itself starts extraction. A document still "uploaded" after this
   * long was missed (for example, the AI service was offline) and is restarted
   * automatically the next time the student opens their documents.
   */
  resumeUploadAfterMs: 30 * 1000,
} as const;

/** Input limits shared by the content-analysis and quiz-generation contracts. */
export const aiSentenceLimits = {
  maxSentences: 500,
  maxCharacters: 100_000,
} as const;

export interface DocumentUploadMetadata {
  readonly title: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface DocumentUploadFormState {
  readonly error?: string;
  readonly notice?: string;
  readonly values?: {
    readonly title: string;
  };
}

export interface DocumentRenameFormState {
  readonly error?: string;
  readonly notice?: string;
}

export interface DocumentDeleteFormState {
  readonly error?: string;
}

export interface DocumentProcessFormState {
  readonly error?: string;
  readonly notice?: string;
}

/** Response of the AI service's POST /documents/process contract. */
export interface DocumentProcessingResult {
  readonly document_id: number;
  readonly status: "ready";
  readonly page_count: number | null;
  readonly word_count: number;
  readonly character_count: number;
  readonly sentence_count: number;
  readonly language_code: string;
  readonly extractor: string;
  readonly warnings: readonly string[];
}

export type DocumentUploadValidation =
  | { readonly ok: true; readonly value: DocumentUploadMetadata }
  | { readonly ok: false; readonly error: string };

export type DocumentTitleValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string };

export function validateDocumentTitle(rawTitle: string): DocumentTitleValidation {
  const title = rawTitle.trim();

  if (!title) {
    return { ok: false, error: "Enter a title for this learning material." };
  }

  if (title.length > documentUploadRules.maxTitleLength) {
    return {
      ok: false,
      error: `Keep the title under ${documentUploadRules.maxTitleLength} characters.`,
    };
  }

  return { ok: true, value: title };
}

export function validateDocumentUpload(
  metadata: DocumentUploadMetadata,
): DocumentUploadValidation {
  const titleValidation = validateDocumentTitle(metadata.title);

  if (!titleValidation.ok) {
    return titleValidation;
  }

  if (!metadata.fileName.trim() || metadata.sizeBytes <= 0) {
    return { ok: false, error: "Choose a PDF or DOCX file to upload." };
  }

  if (
    !documentUploadRules.allowedMimeTypes.includes(
      metadata.mimeType as (typeof documentUploadRules.allowedMimeTypes)[number],
    )
  ) {
    return { ok: false, error: "Only PDF and DOCX files are supported." };
  }

  if (metadata.sizeBytes > documentUploadRules.maxBytes) {
    return { ok: false, error: "The file must be 25 MB or smaller." };
  }

  return {
    ok: true,
    value: {
      ...metadata,
      title: titleValidation.value,
      fileName: metadata.fileName.trim(),
    },
  };
}

export interface CreateDocumentInput {
  readonly ownerId: string;
  readonly title: string;
  readonly fileName: string;
  readonly storagePath: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

/** Lightweight statistics about the stored extraction result. */
export interface DocumentContentSummary {
  readonly sentenceCount: number;
  readonly wordCount: number;
  readonly characterCount: number;
  readonly pageCount: number | null;
  readonly warnings: readonly string[];
}

/** Cleaned text and sentences used by content analysis and quiz generation. */
export interface DocumentContent extends DocumentContentSummary {
  readonly documentId: number;
  readonly text: string;
  readonly sentences: readonly string[];
  readonly languageCode: string;
  readonly extractedAt: string;
}

/** Extracted text prepared to be reused by the analysis and quiz modules. */
export interface DocumentStudySource {
  readonly id: number;
  readonly title: string;
  readonly fileName: string;
  readonly text: string;
  readonly sentenceCount: number;
}

/** A ready document that a student can select as an AI input source. */
export interface DocumentStudySourceOption {
  readonly id: number;
  readonly title: string;
  readonly fileName: string;
  readonly sentenceCount: number;
}

export interface DocumentRecord extends CreateDocumentInput {
  readonly id: number;
  readonly status: DocumentStatus;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly content: DocumentContentSummary | null;
}

/** What the Manage documents tab needs; storage paths stay on the server. */
export interface ManagedDocumentSummary {
  readonly id: number;
  readonly title: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly status: DocumentStatus;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly content: DocumentContentSummary | null;
  readonly canRetry: boolean;
  readonly canDelete: boolean;
  readonly awaitingExtraction: boolean;
}

/**
 * Keep the first sentences that fit the AI service input limits. Sentences are
 * stored in reading order, so this preserves the start of the material.
 */
export function limitSentencesForAi(
  sentences: readonly string[],
): readonly string[] {
  const selected: string[] = [];
  let characters = 0;

  for (const sentence of sentences) {
    if (
      selected.length >= aiSentenceLimits.maxSentences ||
      characters + sentence.length > aiSentenceLimits.maxCharacters
    ) {
      break;
    }

    selected.push(sentence);
    characters += sentence.length;
  }

  return selected;
}

export class LearningDocument {
  constructor(private readonly record: DocumentRecord) {}

  get id(): number {
    return this.record.id;
  }

  get title(): string {
    return this.record.title;
  }

  get status(): DocumentStatus {
    return this.record.status;
  }

  get storagePath(): string {
    return this.record.storagePath;
  }

  get fileName(): string {
    return this.record.fileName;
  }

  get data(): DocumentRecord {
    return { ...this.record };
  }

  get content(): DocumentContentSummary | null {
    return this.record.content;
  }

  isProcessingStale(now: Date = new Date()): boolean {
    return (
      this.status === "processing" &&
      now.getTime() - Date.parse(this.record.updatedAt) >=
        documentProcessingRules.staleAfterMs
    );
  }

  /** True while extraction is queued or running, so pages keep checking. */
  isAwaitingExtraction(): boolean {
    return this.status === "uploaded" || this.status === "processing";
  }

  /** Extraction never started, or its worker crashed; restart it without asking. */
  needsAutomaticProcessing(now: Date = new Date()): boolean {
    if (this.status === "uploaded") {
      return (
        now.getTime() - Date.parse(this.record.createdAt) >=
        documentProcessingRules.resumeUploadAfterMs
      );
    }

    return this.isProcessingStale(now);
  }

  canStartProcessing(now: Date = new Date()): boolean {
    return (
      this.status === "uploaded" ||
      this.status === "failed" ||
      this.isProcessingStale(now)
    );
  }

  /** The AI service may still be writing results, so the record must stay. */
  canBeDeleted(now: Date = new Date()): boolean {
    return this.status !== "processing" || this.isProcessingStale(now);
  }

  toManagedSummary(now: Date = new Date()): ManagedDocumentSummary {
    return {
      id: this.record.id,
      title: this.record.title,
      fileName: this.record.fileName,
      mimeType: this.record.mimeType,
      sizeBytes: this.record.sizeBytes,
      status: this.record.status,
      errorMessage: this.record.errorMessage,
      createdAt: this.record.createdAt,
      content: this.record.content,
      // Only genuine failures need the student; everything else runs itself.
      canRetry: this.status === "failed",
      canDelete: this.canBeDeleted(now),
      awaitingExtraction: this.isAwaitingExtraction(),
    };
  }
}
