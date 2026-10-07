import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import type { LearningDocument } from "@/models/document/document.model";

export class DocumentController {
  constructor(private readonly documents: DocumentRepository) {}

  list(): Promise<LearningDocument[]> {
    return this.documents.listForCurrentUser();
  }

  async show(id: number): Promise<LearningDocument> {
    const document = await this.documents.findById(id);

    if (!document) {
      throw new Error("Document not found.");
    }

    return document;
  }
}
