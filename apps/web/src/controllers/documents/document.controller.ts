import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import type { DocumentStorage } from "@/interfaces/services/document-storage.interface";
import {
  validateDocumentUpload,
  type DocumentUploadFormState,
  type LearningDocument,
} from "@/models/document/document.model";

export class DocumentController {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly storage: DocumentStorage,
  ) {}

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

  async upload(input: {
    readonly ownerId: string;
    readonly title: string;
    readonly file: File;
  }): Promise<DocumentUploadFormState> {
    const validation = validateDocumentUpload({
      title: input.title,
      fileName: input.file.name,
      mimeType: input.file.type,
      sizeBytes: input.file.size,
    });

    if (!validation.ok) {
      return { error: validation.error, values: { title: input.title } };
    }

    let storedPath: string | null = null;

    try {
      const stored = await this.storage.upload({
        ownerId: input.ownerId,
        fileName: validation.value.fileName,
        mimeType: validation.value.mimeType,
        body: input.file,
      });
      storedPath = stored.path;

      await this.documents.create({
        ownerId: input.ownerId,
        title: validation.value.title,
        fileName: validation.value.fileName,
        storagePath: stored.path,
        mimeType: validation.value.mimeType,
        sizeBytes: validation.value.sizeBytes,
      });

      return {
        notice: `${validation.value.fileName} was uploaded successfully.`,
      };
    } catch (error) {
      if (storedPath) {
        try {
          await this.storage.remove(storedPath);
        } catch {
          // Preserve the original failure; orphan cleanup can be retried later.
        }
      }

      console.error("Document upload failed.", error);
      return {
        error: "The document could not be uploaded. Please try again.",
        values: { title: input.title },
      };
    }
  }
}
