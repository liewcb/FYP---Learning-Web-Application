import type { LearningResultsRepository } from "@/interfaces/repositories/learning-results.repository";
import type { SavedContentAnalysis } from "@/models/analysis/content-analysis.model";
import type { SavedQuiz, SavedQuizSummary } from "@/models/quiz/quiz.model";

/** Coordinates the saved, student-visible output of the AI modules. */
export class LearningResultsController {
  constructor(private readonly results: LearningResultsRepository) {}

  latestAnalysis(documentId: number): Promise<SavedContentAnalysis | null> {
    return this.results.findLatestReadyAnalysis(documentId);
  }

  savedQuizzes(limit = 24): Promise<SavedQuizSummary[]> {
    return this.results.listSavedQuizzes(limit);
  }

  savedQuiz(quizId: number): Promise<SavedQuiz | null> {
    return this.results.findSavedQuiz(quizId);
  }
}
