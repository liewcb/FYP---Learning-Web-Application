import type { SupabaseClient } from "@supabase/supabase-js";

import type { LearningResultsRepository } from "@/interfaces/repositories/learning-results.repository";
import type {
  AnalysisConcept,
  AnalysisSelection,
  AnalysisTopic,
  ContentAnalysisResult,
  ImportantSentence,
  KeywordScore,
  SavedContentAnalysis,
} from "@/models/analysis/content-analysis.model";
import type {
  QuizDifficulty,
  QuizQuestionType,
  SavedQuiz,
  SavedQuizQuestion,
  SavedQuizSummary,
} from "@/models/quiz/quiz.model";

interface AnalysisRow {
  id: number;
  document_id: number;
  sentence_count: number | null;
  baseline_keywords: unknown;
  semantic_keywords: unknown;
  important_sentences: unknown;
  topics: unknown;
  concepts: unknown;
  model_info: unknown;
  completed_at: string | null;
}

interface QuizRow {
  id: number;
  document_id: number;
  title: string;
  difficulty: string;
  question_count: number;
  created_at: string;
  quiz_questions?: QuizQuestionRow[] | null;
}

interface QuizQuestionRow {
  id: number;
  position: number;
  question_type: string;
  prompt: string;
  options: unknown;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is number =>
          typeof item === "number" && Number.isSafeInteger(item),
      )
    : [];
}

function keywordScores(value: unknown): KeywordScore[] {
  return records(value).flatMap((item) => {
    const term = typeof item.term === "string" ? item.term : null;
    const score = typeof item.score === "number" ? item.score : null;
    const method = item.method;

    return term && score !== null && (method === "tfidf" || method === "keybert")
      ? [{ term, score, method }]
      : [];
  });
}

function importantSentences(value: unknown): ImportantSentence[] {
  return records(value).flatMap((item) => {
    const text = typeof item.text === "string" ? item.text : null;
    const score = typeof item.score === "number" ? item.score : null;
    const originalIndex = item.original_index;

    return text && score !== null && typeof originalIndex === "number"
      ? [{ text, score, original_index: originalIndex }]
      : [];
  });
}

function topics(value: unknown): AnalysisTopic[] {
  return records(value).flatMap((item) => {
    const label = typeof item.label === "string" ? item.label : null;

    return label
      ? [
          {
            label,
            keywords: strings(item.keywords),
            sentence_indexes: numbers(item.sentence_indexes),
            sentences: strings(item.sentences),
          },
        ]
      : [];
  });
}

function concepts(value: unknown): AnalysisConcept[] {
  return records(value).flatMap((item) => {
    const term = typeof item.term === "string" ? item.term : null;
    const kind = typeof item.kind === "string" ? item.kind : null;

    return term && kind ? [{ term, kind }] : [];
  });
}

function selection(value: unknown): AnalysisSelection | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const item = value as Record<string, unknown>;
  const count = (key: string) =>
    typeof item[key] === "number" ? (item[key] as number) : null;
  const keywords = count("keyword_count");
  const sentences = count("important_sentence_count");
  const topicCount = count("topic_count");

  if (keywords === null || sentences === null || topicCount === null) {
    return undefined;
  }

  return {
    automatic: item.automatic === true,
    keyword_count: keywords,
    important_sentence_count: sentences,
    topic_count: topicCount,
    topic_silhouette: count("topic_silhouette"),
    notes: strings(item.notes),
  };
}

function analysisResult(row: AnalysisRow): ContentAnalysisResult {
  const model =
    typeof row.model_info === "object" && row.model_info !== null
      ? row.model_info as Record<string, unknown>
      : {};

  return {
    sentence_count: row.sentence_count ?? 0,
    baseline_keywords: keywordScores(row.baseline_keywords),
    semantic_keywords: keywordScores(row.semantic_keywords),
    important_sentences: importantSentences(row.important_sentences),
    topics: topics(row.topics),
    concepts: concepts(row.concepts),
    model: {
      embedding_model:
        typeof model.embedding_model === "string" ? model.embedding_model : "Saved analysis",
      keyword_method:
        typeof model.keyword_method === "string" ? model.keyword_method : "Saved analysis",
      topic_method:
        typeof model.topic_method === "string" ? model.topic_method : "Saved analysis",
      concept_method:
        typeof model.concept_method === "string" ? model.concept_method : "Saved analysis",
      trained_for_this_project: model.trained_for_this_project === true,
    },
    selection: selection(model.selection),
  };
}

function isQuizDifficulty(value: string): value is QuizDifficulty {
  return value === "easy" || value === "medium" || value === "hard" || value === "mixed";
}

function isQuestionType(value: string): value is QuizQuestionType {
  return value === "multiple_choice" || value === "true_false" || value === "short_answer";
}

function quizSummary(row: QuizRow): SavedQuizSummary {
  return {
    id: row.id,
    documentId: row.document_id,
    title: row.title,
    difficulty: isQuizDifficulty(row.difficulty) ? row.difficulty : "mixed",
    questionCount: row.question_count,
    createdAt: row.created_at,
  };
}

function quizQuestion(row: QuizQuestionRow): SavedQuizQuestion | null {
  if (!isQuestionType(row.question_type)) {
    return null;
  }

  return {
    id: row.id,
    position: row.position,
    questionType: row.question_type,
    prompt: row.prompt,
    options: strings(row.options),
  };
}

/** Supabase adapter for the student-visible, read-only AI history. */
export class SupabaseLearningResultsRepository implements LearningResultsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findLatestReadyAnalysis(documentId: number): Promise<SavedContentAnalysis | null> {
    const { data, error } = await this.supabase
      .from("document_analyses")
      .select(
        "id, document_id, sentence_count, baseline_keywords, semantic_keywords, important_sentences, topics, concepts, model_info, completed_at",
      )
      .eq("document_id", documentId)
      .eq("status", "ready")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load saved analysis: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const row = data as AnalysisRow;

    return {
      id: row.id,
      documentId: row.document_id,
      result: analysisResult(row),
      completedAt: row.completed_at ?? "",
    };
  }

  async listSavedQuizzes(limit: number): Promise<SavedQuizSummary[]> {
    const { data, error } = await this.supabase
      .from("quizzes")
      .select("id, document_id, title, difficulty, question_count, created_at")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Unable to load saved quizzes: ${error.message}`);
    }

    return (data as QuizRow[]).map(quizSummary);
  }

  async findSavedQuiz(quizId: number): Promise<SavedQuiz | null> {
    const { data, error } = await this.supabase
      .from("quizzes")
      .select(
        "id, document_id, title, difficulty, question_count, created_at, quiz_questions(id, position, question_type, prompt, options)",
      )
      .eq("id", quizId)
      .eq("status", "ready")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load saved quiz: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const row = data as QuizRow;
    const questions = (row.quiz_questions ?? [])
      .map(quizQuestion)
      .filter((question): question is SavedQuizQuestion => question !== null)
      .sort((first, second) => first.position - second.position);

    return { ...quizSummary(row), questions };
  }
}
