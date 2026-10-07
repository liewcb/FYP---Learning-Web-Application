export const documentStatuses = [
  "uploaded",
  "processing",
  "ready",
  "failed",
] as const;

export type DocumentStatus = (typeof documentStatuses)[number];

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
