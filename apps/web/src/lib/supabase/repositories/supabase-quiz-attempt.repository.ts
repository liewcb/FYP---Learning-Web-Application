import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  QuestionSources,
  QuizAttemptRepository,
} from "@/interfaces/repositories/quiz-attempt.repository";
import type {
  RecommendationContext,
  RecommendationTopic,
} from "@/models/quiz/study-recommendation.model";
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

  async findRecommendationInputs(quizId: number, attemptId: number) {
    const [quiz, questions, previous] = await Promise.all([
      this.supabase.from("quizzes").select("id, document_id, analysis_id").eq("id", quizId).maybeSingle(),
      this.supabase
        .from("quiz_questions")
        .select("position, source_sentence_indexes, source_sentences")
        .eq("quiz_id", quizId),
      this.supabase
        .from("quiz_attempts")
        .select("score, max_score")
        .eq("quiz_id", quizId)
        .eq("status", "graded")
        .lt("id", attemptId)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    for (const result of [quiz, questions, previous]) {
      if (result.error) {
        throw new Error(`Unable to load recommendation data: ${result.error.message}`);
      }
    }

    const sources = new Map<number, QuestionSources>(
      ((questions.data ?? []) as {
        position: number;
        source_sentence_indexes: number[] | null;
        source_sentences: string[] | null;
      }[]).map((row) => [
        row.position,
        { sentences: row.source_sentences ?? [], indexes: row.source_sentence_indexes ?? [] },
      ]),
    );
    const quizRow = quiz.data as { id: number; document_id: number; analysis_id: number | null } | null;

    if (!quizRow) {
      return { context: null, sources };
    }

    let topics: RecommendationTopic[] = [];
    let importantSentences: string[] = [];
    let analysisSentenceCount: number | null = null;

    if (quizRow.analysis_id !== null) {
      const { data, error } = await this.supabase
        .from("document_analyses")
        .select("sentence_count, topics, important_sentences")
        .eq("id", quizRow.analysis_id)
        .maybeSingle();

      if (error) {
        throw new Error(`Unable to load the analysis: ${error.message}`);
      }

      const row = data as { sentence_count: number | null; topics: unknown; important_sentences: unknown } | null;

      if (row) {
        analysisSentenceCount = row.sentence_count;
        topics = (Array.isArray(row.topics) ? row.topics : []).flatMap((item: unknown) => {
          const topic = (item ?? {}) as Record<string, unknown>;

          return typeof topic.label === "string"
            ? [{
                label: topic.label,
                keywords: Array.isArray(topic.keywords) ? topic.keywords.filter((k): k is string => typeof k === "string") : [],
                sentenceIndexes: Array.isArray(topic.sentence_indexes)
                  ? topic.sentence_indexes.filter((n): n is number => typeof n === "number")
                  : [],
                sentences: Array.isArray(topic.sentences) ? topic.sentences.filter((t): t is string => typeof t === "string") : [],
              }]
            : [];
        });
        importantSentences = (Array.isArray(row.important_sentences) ? row.important_sentences : [])
          .map((item: unknown) => (item ?? {}) as { text?: unknown; score?: unknown })
          .filter((item) => typeof item.text === "string")
          .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
          .map((item) => item.text as string);
      }
    }

    const previousRow = previous.data as { score: number | string | null; max_score: number | string | null } | null;
    const context: RecommendationContext = {
      quizId: quizRow.id,
      documentId: quizRow.document_id,
      topics,
      importantSentences,
      analysisSentenceCount,
      previousPercentage: previousRow
        ? scorePercentage(Number(previousRow.score ?? 0), Number(previousRow.max_score ?? 0))
        : null,
    };

    return { context, sources };
  }
}
