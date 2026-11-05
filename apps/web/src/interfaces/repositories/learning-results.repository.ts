import type { SavedContentAnalysis } from "@/models/analysis/content-analysis.model";
import type { SavedQuiz, SavedQuizSummary } from "@/models/quiz/quiz.model";

/**
 * Read-only history of AI output. Row-level security limits every returned
 * record to documents owned by the signed-in student.
 */
export interface LearningResultsRepository {
  findLatestReadyAnalysis(documentId: number): Promise<SavedContentAnalysis | null>;
  listSavedQuizzes(limit: number): Promise<SavedQuizSummary[]>;
  findSavedQuiz(quizId: number): Promise<SavedQuiz | null>;
}
