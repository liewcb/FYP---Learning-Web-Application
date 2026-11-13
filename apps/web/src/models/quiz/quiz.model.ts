export const quizDifficulties = ["easy", "medium", "hard", "mixed"] as const;
export const quizQuestionTypes = [
  "multiple_choice",
  "true_false",
  "short_answer",
] as const;

export type QuizDifficulty = (typeof quizDifficulties)[number];
export type QuizQuestionType = (typeof quizQuestionTypes)[number];

export interface QuizGenerationRequest {
  readonly material_title: string;
  readonly sentences: readonly string[];
  readonly question_count: number;
  readonly difficulty: QuizDifficulty;
  readonly question_types: readonly QuizQuestionType[];
}

export interface GeneratedQuizQuestion {
  readonly question_type: QuizQuestionType;
  readonly prompt: string;
  readonly options: readonly string[];
  readonly correct_answer: string;
  readonly explanation: string;
  readonly source_sentence_indexes: readonly number[];
  readonly position: number;
}

export interface GeneratedQuiz {
  readonly title: string;
  readonly difficulty: QuizDifficulty;
  readonly model: string;
  readonly questions: readonly GeneratedQuizQuestion[];
}

/** The response from the trusted endpoint after it has saved a quiz and its answer keys. */
export interface PersistedGeneratedQuiz extends GeneratedQuiz {
  readonly quiz_id: number;
}

/** A lightweight entry shown in a student's saved-assessment history. */
export interface SavedQuizSummary {
  readonly id: number;
  readonly documentId: number;
  readonly title: string;
  readonly difficulty: QuizDifficulty;
  readonly questionCount: number;
  readonly createdAt: string;
}

/** Stored questions intentionally omit correct answers and explanations. */
export interface SavedQuizQuestion {
  readonly id: number;
  readonly position: number;
  readonly questionType: QuizQuestionType;
  readonly prompt: string;
  readonly options: readonly string[];
}

export interface SavedQuiz extends SavedQuizSummary {
  readonly questions: readonly SavedQuizQuestion[];
}

export interface QuizGenerationFormValues {
  readonly materialTitle: string;
  readonly text: string;
  readonly questionCount: string;
  readonly difficulty: string;
  readonly questionTypes: readonly string[];
}

export interface QuizGenerationFormState {
  readonly error?: string;
  readonly result?: GeneratedQuiz;
  readonly values?: QuizGenerationFormValues;
  /** Present only when the generated assessment was saved against a document. */
  readonly savedQuizId?: number;
  /** Explains when a long document was sampled to fit the model limits. */
  readonly notice?: string;
}

export type QuizAnswers = Readonly<Record<number, string>>;

/** Answers keyed by question position, as the attempt actions take them. */
export function toAnswerRecord(answers: QuizAnswers): Record<string, string> {
  return Object.fromEntries(Object.entries(answers).map(([position, answer]) => [position, answer]));
}

export interface QuizScore {
  readonly correct: number;
  readonly total: number;
  readonly percentage: number;
}

/**
 * Mirrors private.normalise_quiz_answer() so local and stored grades agree.
 * Punctuation becomes a space, so "fault-tree" matches "fault tree".
 */
export function normaliseAnswer(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Grades generated answers consistently without requiring another AI request. */
export function isCorrectQuizAnswer(
  question: GeneratedQuizQuestion,
  answer: string | undefined,
): boolean {
  const given = normaliseAnswer(answer ?? "");

  return given !== "" && given === normaliseAnswer(question.correct_answer);
}

export function calculateQuizScore(
  questions: readonly GeneratedQuizQuestion[],
  answers: QuizAnswers,
): QuizScore {
  const correct = questions.filter((question) =>
    isCorrectQuizAnswer(question, answers[question.position]),
  ).length;
  const total = questions.length;

  return {
    correct,
    total,
    percentage: total === 0 ? 0 : Math.round((correct / total) * 100),
  };
}

export function isQuizDifficulty(value: string): value is QuizDifficulty {
  return quizDifficulties.includes(value as QuizDifficulty);
}

export function validQuestionTypes(
  values: readonly string[],
): QuizQuestionType[] {
  return quizQuestionTypes.filter((type) => values.includes(type));
}
