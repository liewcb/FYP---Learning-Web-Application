import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import type { AiService } from "@/interfaces/services/ai-service.interface";
import type { BackgroundTaskRunner } from "@/interfaces/services/background-task-runner.interface";
import type { DocumentStorage } from "@/interfaces/services/document-storage.interface";
import {
  validateDocumentTitle,
  validateDocumentUpload,
  type DocumentContent,
  type DocumentDeleteFormState,
  type DocumentProcessFormState,
  type DocumentRenameFormState,
  type DocumentUploadFormState,
  type LearningDocument,
  type ManagedDocumentSummary,
} from "@/models/document/document.model";

export class DocumentController {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly storage: DocumentStorage,
    private readonly ai: AiService,
    private readonly background: BackgroundTaskRunner,
  ) {}

  list(): Promise<LearningDocument[]> {
    return this.documents.listForCurrentUser();
  }

  /**
   * Lists the student's documents and, in the background, restarts text
   * extraction for any upload that was missed or whose worker crashed.
   */
  async listAndResumeProcessing(): Promise<LearningDocument[]> {
    const now = new Date();
    const documents = await this.documents.listForCurrentUser();

    for (const document of documents) {
      if (document.needsAutomaticProcessing(now)) {
        this.background.run(() => this.processInBackground(document.id));
      }
    }

    return documents;
  }

  async listForManagement(): Promise<ManagedDocumentSummary[]> {
    const now = new Date();
    const documents = await this.listAndResumeProcessing();

    return documents.map((document) => document.toManagedSummary(now));
  }

  /**
   * Cleaned sentences for content analysis and quiz generation. Returns null
   * until the document has been processed successfully.
   */
  async content(id: number): Promise<DocumentContent | null> {
    const document = await this.documents.findById(id);

    if (!document || document.status !== "ready") {
      return null;
    }

    return this.documents.findContent(id);
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

      const document = await this.documents.create({
        ownerId: input.ownerId,
        title: validation.value.title,
        fileName: validation.value.fileName,
        storagePath: stored.path,
        mimeType: validation.value.mimeType,
        sizeBytes: validation.value.sizeBytes,
      });

      this.background.run(() => this.processInBackground(document.id));

      return {
        notice: `${validation.value.fileName} was uploaded. Text extraction has started and usually finishes within a minute.`,
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
  async process(id: number): Promise<DocumentProcessFormState> {
    try {
      const document = await this.documents.findById(id);

      if (!document) {
        return { error: "This document no longer exists." };
      }

      if (!document.canStartProcessing()) {
        return {
          error:
            document.status === "ready"
              ? "This document has already been processed."
              : "This document is already being processed.",
        };
      }

      const result = await this.ai.processDocument(id);
      const sentences = result.sentence_count === 1 ? "sentence" : "sentences";

      return {
        notice: `Text extracted: ${result.sentence_count} ${sentences} are ready for analysis and quizzes.`,
      };
    } catch (error) {
      console.error("Document processing failed.", error);
      return {
        error:
          error instanceof Error
            ? error.message
            : "Text extraction could not be completed. Please try again.",
      };
    }
  }

  private async processInBackground(id: number): Promise<void> {
    try {
      await this.ai.processDocument(id);
    } catch (error) {
      // The AI service records extraction failures on the document itself.
      // If it was unreachable, the document stays "uploaded" and is restarted
      // automatically the next time the student opens their documents.
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`Background processing of document ${id} did not finish: ${reason}`);
    }
  }

  async rename(id: number, rawTitle: string): Promise<DocumentRenameFormState> {
    const validation = validateDocumentTitle(rawTitle);

    if (!validation.ok) {
      return { error: validation.error };
    }

    try {
      // Row-level security limits the lookup to the signed-in owner's files.
      const document = await this.documents.findById(id);

      if (!document) {
        return { error: "This document no longer exists." };
      }

      if (document.title !== validation.value) {
        await this.documents.updateTitle(id, validation.value);
      }

      return { notice: "Title updated." };
    } catch (error) {
      console.error("Document rename failed.", error);
      return { error: "The title could not be updated. Please try again." };
    }
  }

  async delete(id: number): Promise<DocumentDeleteFormState> {
    let document: LearningDocument | null;

    try {
      document = await this.documents.findById(id);

      if (!document) {
        return {};
      }

      if (!document.canBeDeleted()) {
        return {
          error: "This document is still being processed. Try again once it finishes.",
        };
      }

      await this.documents.delete(id);
    } catch (error) {
      console.error("Document delete failed.", error);
      return { error: "The document could not be deleted. Please try again." };
    }

    try {
      await this.storage.remove(document.storagePath);
    } catch (error) {
      // The record is already gone. Keep the delete successful for the
      // student and leave the orphaned file for administrative cleanup.
      console.error("Deleted document file cleanup failed.", error);
    }

    return {};
  }

  async downloadUrl(id: number): Promise<string | null> {
    const document = await this.documents.findById(id);

    if (!document) {
      return null;
    }

    return this.storage.createDownloadUrl(document.storagePath, document.fileName);
  }
}
