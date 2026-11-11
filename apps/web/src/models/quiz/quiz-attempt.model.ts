import {
  isCorrectQuizAnswer,
  type GeneratedQuiz,
  type QuizAnswers,
  type QuizDifficulty,
  type QuizQuestionType,
  type QuizScore,
} from "@/models/quiz/quiz.model";

/** A question as the student sees it before submitting: no answer key. */
export interface QuizAttemptQuestion {
  readonly position: number;
  readonly questionType: QuizQuestionType;
  readonly prompt: string;
  readonly options: readonly string[];
}

/** One graded question, revealed only after the attempt is submitted. */
export interface QuizReviewItem extends QuizAttemptQuestion {
  readonly response: string;
  readonly isCorrect: boolean;
  readonly correctAnswer: string;
  readonly explanation: string;
}

export interface QuizAttemptResult {
  readonly score: QuizScore;
  readonly items: readonly QuizReviewItem[];
  /** Present when the attempt was stored in the student's history. */
  readonly attemptId?: number;
}

export type QuizAttemptOutcome =
  | { readonly ok: true; readonly result: QuizAttemptResult }
  | { readonly ok: false; readonly error: string };

/** One row in the student's attempt history. */
export interface QuizAttemptSummary {
  readonly id: number;
  readonly quizId: number;
  readonly quizTitle: string;
  readonly difficulty: QuizDifficulty;
  readonly score: number;
  readonly maxScore: number;
  readonly percentage: number;
  readonly startedAt: string;
  readonly submittedAt: string;
}

export interface QuizAttemptReview {
  readonly attempt: QuizAttemptSummary;
  readonly items: readonly QuizReviewItem[];
}

export interface QuizPerformanceSummary {
  readonly attemptCount: number;
  readonly quizCount: number;
  readonly averagePercentage: number;
  readonly bestPercentage: number;
  readonly latestPercentage: number | null;
  /** Latest minus previous attempt, in percentage points. */
  readonly trend: number | null;
}

export function scorePercentage(score: number, maxScore: number): number {
  return maxScore <= 0 ? 0 : Math.round((score / maxScore) * 100);
}

export function scoreFromItems(items: readonly QuizReviewItem[]): QuizScore {
  const correct = items.filter((item) => item.isCorrect).length;

  return {
    correct,
    total: items.length,
    percentage: scorePercentage(correct, items.length),
  };
}

export function quizScoreMessage(percentage: number): string {
  if (percentage === 100) {
    return "Excellent work - every answer is correct.";
  }

  if (percentage >= 70) {
    return "Good work. Review the feedback for the questions you missed.";
  }

  return "Keep practising. Use the explanations below before trying again.";
}

export function questionsFromGeneratedQuiz(
  quiz: GeneratedQuiz,
): QuizAttemptQuestion[] {
  return quiz.questions.map((question) => ({
    position: question.position,
    questionType: question.question_type,
    prompt: question.prompt,
    options: question.options,
  }));
}

/**
 * Grades a quiz that was generated from pasted text and therefore has no
 * stored copy. Uploaded-document quizzes are graded by the database instead.
 */
export function gradeGeneratedQuizLocally(
  quiz: GeneratedQuiz,
  answers: QuizAnswers,
): QuizAttemptResult {
  const items = quiz.questions.map((question) => ({
    position: question.position,
    questionType: question.question_type,
    prompt: question.prompt,
    options: question.options,
    response: answers[question.position] ?? "",
    isCorrect: isCorrectQuizAnswer(question, answers[question.position]),
    correctAnswer: question.correct_answer,
    explanation: question.explanation,
  }));

  return { score: scoreFromItems(items), items };
}

export type QuizAttemptValidation =
  | { readonly ok: true; readonly answers: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly error: string };

/** Keeps the submitted payload small and well-formed before it reaches SQL. */
export function validateAttemptAnswers(answers: unknown): QuizAttemptValidation {
  if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
    return { ok: false, error: "Your answers could not be read. Please try again." };
  }

  const entries = Object.entries(answers as Record<string, unknown>);

  if (entries.length === 0 || entries.length > 50) {
    return { ok: false, error: "Answer the questions before submitting." };
  }

  const cleaned: Record<string, string> = {};

  for (const [position, answer] of entries) {
    const index = Number(position);

    if (!Number.isInteger(index) || index < 1 || index > 50 || typeof answer !== "string") {
      return { ok: false, error: "Your answers could not be read. Please try again." };
    }

    cleaned[String(index)] = answer.trim().slice(0, 1000);
  }

  return { ok: true, answers: cleaned };
}

export function summarisePerformance(
  attempts: readonly QuizAttemptSummary[],
): QuizPerformanceSummary {
  if (attempts.length === 0) {
    return {
      attemptCount: 0,
      quizCount: 0,
      averagePercentage: 0,
      bestPercentage: 0,
      latestPercentage: null,
      trend: null,
    };
  }

  // Attempts arrive newest first.
  const percentages = attempts.map((attempt) => attempt.percentage);
  const total = percentages.reduce((sum, value) => sum + value, 0);

  return {
    attemptCount: attempts.length,
    quizCount: new Set(attempts.map((attempt) => attempt.quizId)).size,
    averagePercentage: Math.round(total / attempts.length),
    bestPercentage: Math.max(...percentages),
    latestPercentage: percentages[0],
    trend: percentages.length > 1 ? percentages[0] - percentages[1] : null,
  };
}

export function formatAttemptDuration(startedAt: string, submittedAt: string): string {
  const seconds = Math.max(
    0,
    Math.round((Date.parse(submittedAt) - Date.parse(startedAt)) / 1000),
  );

  if (!Number.isFinite(seconds) || seconds < 1) {
    return "—";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return remainder === 0 ? `${minutes} min` : `${minutes} min ${remainder}s`;
}
