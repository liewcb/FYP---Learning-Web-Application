import type {
  CreateDocumentInput,
  DocumentContent,
  DocumentStatus,
  LearningDocument,
} from "@/models/document/document.model";

export interface DocumentRepository {
  listForCurrentUser(): Promise<LearningDocument[]>;
  findById(id: number): Promise<LearningDocument | null>;
  /** Extracted text and sentences, or null before processing succeeds. */
  findContent(documentId: number): Promise<DocumentContent | null>;
  create(input: CreateDocumentInput): Promise<LearningDocument>;
  updateTitle(id: number, title: string): Promise<void>;
  delete(id: number): Promise<void>;
  updateStatus(
    id: number,
    status: DocumentStatus,
    errorMessage?: string | null,
  ): Promise<void>;
}
