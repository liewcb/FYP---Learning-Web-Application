import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import type { LearningResultsRepository } from "@/interfaces/repositories/learning-results.repository";
import type { AiService } from "@/interfaces/services/ai-service.interface";
import {
  automaticAnalysisLimits,
  parseBoundedInteger,
  prepareLearningText,
} from "@/models/analysis/content-analysis.model";
import {
  isQuizDifficulty,
  validQuestionTypes,
  type QuizGenerationFormState,
  type QuizGenerationFormValues,
} from "@/models/quiz/quiz.model";

export class QuizController {
  constructor(
    private readonly aiService: AiService,
    private readonly documents: DocumentRepository,
    private readonly results: LearningResultsRepository,
  ) {}

  async generate(
    values: QuizGenerationFormValues,
    documentId: number | null = null,
  ): Promise<QuizGenerationFormState> {
    const materialTitle = values.materialTitle.trim();
    const prepared = prepareLearningText(values.text);
    const questionTypes = validQuestionTypes(values.questionTypes);

    if (!materialTitle) {
      return { error: "Enter a title for the learning material.", values };
    }

    if (materialTitle.length > 200) {
      return { error: "Keep the material title under 200 characters.", values };
    }

    if (!prepared.ok) {
      return { error: prepared.error, values };
    }

    if (questionTypes.length === 0) {
      return { error: "Select at least one question type.", values };
    }

    try {
      const request = {
        material_title: materialTitle,
        sentences: prepared.sentences,
        question_count: parseBoundedInteger(values.questionCount, 3, 1, 20),
        difficulty: isQuizDifficulty(values.difficulty)
          ? values.difficulty
          : "mixed",
        question_types: questionTypes,
      };

      if (documentId !== null) {
        // The document lookup runs with the student's session and therefore
        // prevents a forged form field from saving a quiz for somebody else.
        const document = await this.documents.findById(documentId);

        if (!document || document.status !== "ready") {
          return {
            error: "Choose a Ready document before saving a quiz.",
            values,
          };
        }

        let analysis = await this.results.findLatestReadyAnalysis(documentId);

        // A quiz can start directly from an upload. In that case, save the
        // analysis first so the quiz has an auditable document-analysis link.
        if (!analysis) {
          const savedAnalysis = await this.aiService.analyseAndSaveDocument(documentId, {
            sentences: prepared.sentences,
            ...automaticAnalysisLimits(prepared.sentences.length),
          });

          analysis = {
            id: savedAnalysis.analysis_id,
            documentId,
            result: savedAnalysis,
            completedAt: "",
          };
        }

        const result = await this.aiService.generateAndSaveQuiz(
          documentId,
          analysis.id,
          request,
        );

        return { result, values, savedQuizId: result.quiz_id };
      }

      const result = await this.aiService.generateQuiz(request);

      return { result, values };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "The quiz could not be generated.",
        values,
      };
    }
  }
}
