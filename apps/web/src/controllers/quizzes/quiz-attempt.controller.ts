import type { QuizAttemptRepository } from "@/interfaces/repositories/quiz-attempt.repository";
import {
  scoreFromItems,
  summarisePerformance,
  validateAttemptAnswers,
  type QuizAttemptOutcome,
  type QuizAttemptReview,
  type QuizAttemptSummary,
  type QuizPerformanceSummary,
  type QuizReviewItem,
} from "@/models/quiz/quiz-attempt.model";
import {
  buildStudyRecommendation,
  type StudyRecommendation,
} from "@/models/quiz/study-recommendation.model";

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
      const review = await this.review(attemptId);

      if (!review) {
        return { ok: false, error: "Your attempt was saved, but its review could not be loaded." };
      }

      return {
        ok: true,
        result: {
          attemptId,
          items: review.items,
          score: scoreFromItems(review.items),
          recommendation: review.recommendation,
        },
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

  async review(attemptId: number): Promise<QuizAttemptReview | null> {
    const review = await this.attempts.findReview(attemptId);

    if (!review) {
      return null;
    }

    return {
      ...review,
      recommendation: await this.recommend(review.attempt.quizId, attemptId, review.items),
    };
  }

  /**
   * Builds the study recommendation for an attempt. A failure here never
   * hides the graded result: the student just gets score-based advice.
   */
  private async recommend(
    quizId: number,
    attemptId: number,
    items: readonly QuizReviewItem[],
  ): Promise<StudyRecommendation> {
    const percentage = scoreFromItems(items).percentage;

    try {
      const { context, sources } = await this.attempts.findRecommendationInputs(quizId, attemptId);

      return buildStudyRecommendation(
        items.map((item) => ({
          position: item.position,
          isCorrect: item.isCorrect,
          sourceSentences: sources.get(item.position)?.sentences ?? [],
          sourceSentenceIndexes: sources.get(item.position)?.indexes ?? [],
        })),
        percentage,
        context,
      );
    } catch (error) {
      console.error("Study recommendation failed; using score-based advice.", error);

      return buildStudyRecommendation(
        items.map((item) => ({
          position: item.position,
          isCorrect: item.isCorrect,
          sourceSentences: [],
          sourceSentenceIndexes: [],
        })),
        percentage,
        null,
      );
    }
  }
}
