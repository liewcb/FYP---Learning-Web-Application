import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import type { AiService } from "@/interfaces/services/ai-service.interface";
import {
  parseBoundedInteger,
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
    const prepared = prepareLearningText(values.text);

    if (!prepared.ok) {
      return { error: prepared.error, values };
    }

    try {
      const request = {
        sentences: prepared.sentences,
        top_keywords: parseBoundedInteger(values.topKeywords, 10, 1, 30),
        top_sentences: parseBoundedInteger(values.topSentences, 5, 1, 20),
        max_topics: parseBoundedInteger(values.maxTopics, 5, 1, 10),
      };

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

        const result = await this.aiService.analyseAndSaveDocument(documentId, request);

        return { result, values, savedAnalysisId: result.analysis_id };
      }

      const result = await this.aiService.analyseContent(request);

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
