import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import type { AiService } from "@/interfaces/services/ai-service.interface";
import {
  automaticAnalysisLimits,
  prepareLearningText,
  type ContentAnalysisFormState,
  type ContentAnalysisFormValues,
} from "@/models/analysis/content-analysis.model";

export class ContentAnalysisController {
  constructor(
    private readonly aiService: AiService,
    private readonly documents: DocumentRepository,
  ) {}

  async analyse(
    values: ContentAnalysisFormValues,
    documentId: number | null = null,
  ): Promise<ContentAnalysisFormState> {
    try {
      if (documentId !== null) {
        // The AI service uses a server-only key, so confirm ownership with the
        // current session before asking it to save data for this document.
        const document = await this.documents.findById(documentId);

        if (!document || document.status !== "ready") {
          return {
            error: "Choose a Ready document before saving an analysis.",
            values,
          };
        }

        // Analyse the stored, preprocessed sentences rather than text posted
        // by the browser, so the saved analysis always matches the upload.
        const content = await this.documents.findContent(documentId);

        if (!content || content.sentences.length === 0) {
          return {
            error: "No readable text was found in this document.",
            values,
          };
        }

        const sentences = content.sentences.slice(0, 500);
        const result = await this.aiService.analyseAndSaveDocument(documentId, {
          sentences,
          ...automaticAnalysisLimits(sentences.length),
        });

        return { result, values, savedAnalysisId: result.analysis_id };
      }

      const prepared = prepareLearningText(values.text);

      if (!prepared.ok) {
        return { error: prepared.error, values };
      }

      const result = await this.aiService.analyseContent({
        sentences: prepared.sentences,
        ...automaticAnalysisLimits(prepared.sentences.length),
      });

      return { result, values };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Content analysis could not be completed.",
        values,
      };
    }
  }
}
