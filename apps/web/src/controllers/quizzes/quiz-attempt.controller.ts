import type { QuizAttemptRepository } from "@/interfaces/repositories/quiz-attempt.repository";
import {
  scoreFromItems,
  summarisePerformance,
  validateAttemptAnswers,
  type QuizAttemptOutcome,
  type QuizAttemptReview,
  type QuizAttemptSummary,
  type QuizPerformanceSummary,
} from "@/models/quiz/quiz-attempt.model";

export interface QuizAttemptHistory {
  readonly attempts: readonly QuizAttemptSummary[];
  readonly performance: QuizPerformanceSummary;
}

/** Submits, lists and reviews a student's graded quiz attempts. */
export class QuizAttemptController {
  constructor(private readonly attempts: QuizAttemptRepository) {}

  async submit(
    quizId: number,
    answers: unknown,
    startedAt: string | null,
  ): Promise<QuizAttemptOutcome> {
    if (!Number.isSafeInteger(quizId) || quizId <= 0) {
      return { ok: false, error: "This quiz could not be found." };
    }

    const validation = validateAttemptAnswers(answers);

    if (!validation.ok) {
      return validation;
    }

    const start = startedAt && !Number.isNaN(Date.parse(startedAt)) ? startedAt : null;

    try {
      const attemptId = await this.attempts.submit(quizId, validation.answers, start);
      const review = await this.attempts.findReview(attemptId);

      if (!review) {
        return { ok: false, error: "Your attempt was saved, but its review could not be loaded." };
      }

      return {
        ok: true,
        result: { attemptId, items: review.items, score: scoreFromItems(review.items) },
      };
    } catch (error) {
      console.error("Quiz attempt submission failed.", error);

      return {
        ok: false,
        error: "Your answers could not be submitted. Check your connection and try again.",
      };
    }
  }

  async history(limit = 100): Promise<QuizAttemptHistory> {
    const attempts = await this.attempts.listAttempts({ limit });

    return { attempts, performance: summarisePerformance(attempts) };
  }

  forQuiz(quizId: number, limit = 10): Promise<QuizAttemptSummary[]> {
    return this.attempts.listAttempts({ limit, quizId });
  }

  review(attemptId: number): Promise<QuizAttemptReview | null> {
    return this.attempts.findReview(attemptId);
  }
}
