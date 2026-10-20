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

export type DocumentUploadValidation =
  | { readonly ok: true; readonly value: DocumentUploadMetadata }
  | { readonly ok: false; readonly error: string };

export function validateDocumentUpload(
  metadata: DocumentUploadMetadata,
): DocumentUploadValidation {
  const title = metadata.title.trim();

  if (!title) {
    return { ok: false, error: "Enter a title for this learning material." };
  }

  if (title.length > documentUploadRules.maxTitleLength) {
    return {
      ok: false,
      error: `Keep the title under ${documentUploadRules.maxTitleLength} characters.`,
    };
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
      title,
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

export interface DocumentRecord extends CreateDocumentInput {
  readonly id: number;
  readonly status: DocumentStatus;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
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

  get data(): DocumentRecord {
    return { ...this.record };
  }

  canStartProcessing(): boolean {
    return this.status === "uploaded" || this.status === "failed";
  }
}
