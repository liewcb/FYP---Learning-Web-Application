import type {
  QuizAttemptReview,
  QuizAttemptSummary,
} from "@/models/quiz/quiz-attempt.model";
import type { RecommendationContext } from "@/models/quiz/study-recommendation.model";

export interface QuestionSources {
  readonly sentences: readonly string[];
  readonly indexes: readonly number[];
}

/**
 * Quiz attempts are graded by the database against private answer keys, so
 * a student can store and read their own attempts but never forge a score.
 */
export interface QuizAttemptRepository {
  /** Grades and stores an attempt, returning the new attempt id. */
  submit(
    quizId: number,
    answers: Readonly<Record<string, string>>,
    startedAt: string | null,
  ): Promise<number>;
  /** Newest first. Pass a quiz id to list attempts for one quiz only. */
  listAttempts(options: { limit: number; quizId?: number }): Promise<QuizAttemptSummary[]>;
  findReview(attemptId: number): Promise<QuizAttemptReview | null>;
  /** The material a recommendation is built from; null context when the quiz has no analysis. */
  findRecommendationInputs(
    quizId: number,
    attemptId: number,
  ): Promise<{
    readonly context: RecommendationContext | null;
    readonly sources: ReadonlyMap<number, QuestionSources>;
  }>;
}
