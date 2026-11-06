import type {
  LibraryBrowseFilters,
  LibraryEvent,
  LibraryMaterial,
  LibraryReviewFilter,
  LibraryStatus,
  LibrarySubmission,
} from "@/models/library/library.model";

export interface CreateLibrarySubmissionInput extends Omit<LibrarySubmission, "documentId"> {
  readonly sourceDocumentId: number;
  readonly submittedBy: string;
  readonly storagePath: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface LibraryDecisionInput {
  readonly materialId: number;
  readonly reviewerId: string;
  readonly from: LibraryStatus;
  readonly to: LibraryStatus;
  readonly note: string | null;
}

/** Shared learning library. Reads follow row-level security. */
export interface LibraryRepository {
  listPublished(filters: LibraryBrowseFilters, limit: number): Promise<LibraryMaterial[]>;
  listPublishedSubjects(): Promise<string[]>;
  /** The signed-in student's own submissions, newest first. */
  listMine(viewerId: string): Promise<LibraryMaterial[]>;
  /** Administrator queues. Pending is oldest first. */
  listForReview(status: LibraryReviewFilter, limit: number): Promise<LibraryMaterial[]>;
  countByStatus(): Promise<Record<LibraryReviewFilter, number>>;
  findById(id: number): Promise<LibraryMaterial | null>;
  /** Private file location; null when the viewer cannot see the material. */
  findStorage(id: number): Promise<{ readonly path: string; readonly fileName: string } | null>;
  listEvents(materialId: number): Promise<LibraryEvent[]>;
  /** Throws Error("duplicate_submission") when the document is already pending or published. */
  createSubmission(input: CreateLibrarySubmissionInput): Promise<number>;
  /** Moves a material between statuses; false when it is no longer in `from`. */
  decide(input: LibraryDecisionInput): Promise<boolean>;
  recordView(id: number): Promise<void>;
  recordDownload(id: number): Promise<void>;
}