import type { SupabaseClient } from "@supabase/supabase-js";

import type { QuizAttemptRepository } from "@/interfaces/repositories/quiz-attempt.repository";
import {
  scorePercentage,
  type QuizAttemptReview,
  type QuizAttemptSummary,
  type QuizReviewItem,
} from "@/models/quiz/quiz-attempt.model";
import type { QuizDifficulty, QuizQuestionType } from "@/models/quiz/quiz.model";

interface AttemptRow {
  id: number;
  quiz_id: number;
  score: number | string | null;
  max_score: number | string | null;
  started_at: string;
  submitted_at: string | null;
  quizzes: { title: string; difficulty: string } | { title: string; difficulty: string }[] | null;
}

interface ReviewRow {
  question_position: number;
  question_type: string;
  prompt: string;
  options: unknown;
  response: string | null;
  is_correct: boolean | null;
  correct_answer: string | null;
  explanation: string | null;
}

const attemptColumns =
  "id, quiz_id, score, max_score, started_at, submitted_at, quizzes(title, difficulty)";

function difficulty(value: string | undefined): QuizDifficulty {
  return value === "easy" || value === "medium" || value === "hard" ? value : "mixed";
}

function questionType(value: string): QuizQuestionType {
  return value === "true_false" || value === "short_answer" ? value : "multiple_choice";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function attemptSummary(row: AttemptRow): QuizAttemptSummary {
  // numeric columns arrive from PostgREST as strings or numbers.
  const score = Number(row.score ?? 0);
  const maxScore = Number(row.max_score ?? 0);
  const quiz = Array.isArray(row.quizzes) ? row.quizzes[0] : row.quizzes;

  return {
    id: row.id,
    quizId: row.quiz_id,
    quizTitle: quiz?.title ?? "Deleted quiz",
    difficulty: difficulty(quiz?.difficulty),
    score,
    maxScore,
    percentage: scorePercentage(score, maxScore),
    startedAt: row.started_at,
    submittedAt: row.submitted_at ?? row.started_at,
  };
}

function reviewItem(row: ReviewRow): QuizReviewItem {
  return {
    position: row.question_position,
    questionType: questionType(row.question_type),
    prompt: row.prompt,
    options: strings(row.options),
    response: row.response ?? "",
    isCorrect: row.is_correct === true,
    correctAnswer: row.correct_answer ?? "",
    explanation: row.explanation ?? "",
  };
}

/** Supabase adapter for graded quiz attempts. Runs with the student's session. */
export class SupabaseQuizAttemptRepository implements QuizAttemptRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async submit(
    quizId: number,
    answers: Readonly<Record<string, string>>,
    startedAt: string | null,
  ): Promise<number> {
    const { data, error } = await this.supabase.rpc("submit_quiz_attempt", {
      p_quiz_id: quizId,
      p_answers: answers,
      p_started_at: startedAt,
    });

    if (error) {
      throw new Error(`Unable to save your quiz attempt: ${error.message}`);
    }

    const attemptId = Number(data);

    if (!Number.isSafeInteger(attemptId) || attemptId <= 0) {
      throw new Error("Unable to save your quiz attempt.");
    }

    return attemptId;
  }

  async listAttempts(options: { limit: number; quizId?: number }): Promise<QuizAttemptSummary[]> {
    let query = this.supabase
      .from("quiz_attempts")
      .select(attemptColumns)
      .eq("status", "graded")
      .order("submitted_at", { ascending: false })
      .limit(options.limit);

    if (options.quizId !== undefined) {
      query = query.eq("quiz_id", options.quizId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to load quiz attempts: ${error.message}`);
    }

    return (data as unknown as AttemptRow[]).map(attemptSummary);
  }

  async findReview(attemptId: number): Promise<QuizAttemptReview | null> {
    const { data: attempt, error } = await this.supabase
      .from("quiz_attempts")
      .select(attemptColumns)
      .eq("id", attemptId)
      .eq("status", "graded")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load quiz attempt: ${error.message}`);
    }

    if (!attempt) {
      return null;
    }

    const { data: rows, error: reviewError } = await this.supabase.rpc(
      "get_quiz_attempt_review",
      { p_attempt_id: attemptId },
    );

    if (reviewError) {
      throw new Error(`Unable to load quiz review: ${reviewError.message}`);
    }

    return {
      attempt: attemptSummary(attempt as unknown as AttemptRow),
      items: ((rows ?? []) as ReviewRow[]).map(reviewItem),
    };
  }
}
