import type {
  CreateDocumentInput,
  DocumentStatus,
  LearningDocument,
} from "@/models/document/document.model";

export interface DocumentRepository {
  listForCurrentUser(): Promise<LearningDocument[]>;
  findById(id: number): Promise<LearningDocument | null>;
  create(input: CreateDocumentInput): Promise<LearningDocument>;
  updateStatus(
    id: number,
    status: DocumentStatus,
    errorMessage?: string | null,
  ): Promise<void>;
}
