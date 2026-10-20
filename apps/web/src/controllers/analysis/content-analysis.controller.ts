import type { AiService } from "@/interfaces/services/ai-service.interface";
import {
  parseBoundedInteger,
  prepareLearningText,
  type ContentAnalysisFormState,
  type ContentAnalysisFormValues,
} from "@/models/analysis/content-analysis.model";

export class ContentAnalysisController {
  constructor(private readonly aiService: AiService) {}

  async analyse(
    values: ContentAnalysisFormValues,
  ): Promise<ContentAnalysisFormState> {
    const prepared = prepareLearningText(values.text);

    if (!prepared.ok) {
      return { error: prepared.error, values };
    }

    try {
      const result = await this.aiService.analyseContent({
        sentences: prepared.sentences,
        top_keywords: parseBoundedInteger(values.topKeywords, 10, 1, 30),
        top_sentences: parseBoundedInteger(values.topSentences, 5, 1, 20),
        max_topics: parseBoundedInteger(values.maxTopics, 5, 1, 10),
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
