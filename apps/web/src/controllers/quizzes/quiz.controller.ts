import type { AiService } from "@/interfaces/services/ai-service.interface";
import {
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
  constructor(private readonly aiService: AiService) {}

  async generate(
    values: QuizGenerationFormValues,
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
      const result = await this.aiService.generateQuiz({
        material_title: materialTitle,
        sentences: prepared.sentences,
        question_count: parseBoundedInteger(values.questionCount, 3, 1, 20),
        difficulty: isQuizDifficulty(values.difficulty)
          ? values.difficulty
          : "mixed",
        question_types: questionTypes,
      });

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
