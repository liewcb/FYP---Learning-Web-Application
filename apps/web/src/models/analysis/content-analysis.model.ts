export interface KeywordScore {
  readonly term: string;
  readonly score: number;
  readonly method: "tfidf" | "keybert";
}

export interface ImportantSentence {
  readonly text: string;
  readonly score: number;
  readonly original_index: number;
}

export interface AnalysisTopic {
  readonly label: string;
  readonly keywords: readonly string[];
  readonly sentence_indexes: readonly number[];
  readonly sentences: readonly string[];
}

export interface AnalysisConcept {
  readonly term: string;
  readonly kind: string;
}

export interface ContentAnalysisResult {
  readonly sentence_count: number;
  readonly baseline_keywords: readonly KeywordScore[];
  readonly semantic_keywords: readonly KeywordScore[];
  readonly important_sentences: readonly ImportantSentence[];
  readonly topics: readonly AnalysisTopic[];
  readonly concepts: readonly AnalysisConcept[];
  readonly model: {
    readonly embedding_model: string;
    readonly keyword_method: string;
    readonly topic_method: string;
    readonly concept_method: string;
    readonly trained_for_this_project: boolean;
  };
}

export interface ContentAnalysisRequest {
  readonly sentences: readonly string[];
  readonly top_keywords: number;
  readonly top_sentences: number;
  readonly max_topics: number;
}

export interface ContentAnalysisFormValues {
  readonly text: string;
  readonly topKeywords: string;
  readonly topSentences: string;
  readonly maxTopics: string;
}

export interface ContentAnalysisFormState {
  readonly error?: string;
  readonly result?: ContentAnalysisResult;
  readonly values?: ContentAnalysisFormValues;
}

export type PreparedLearningText =
  | { readonly ok: true; readonly sentences: readonly string[] }
  | { readonly ok: false; readonly error: string };

/**
 * Temporary web-side sentence splitter for UI testing. Shim's preprocessing
 * module will replace this bridge and supply its cleaned sentence array.
 */
export function prepareLearningText(text: string): PreparedLearningText {
  const cleaned = text.trim().replace(/\u0000/g, "");

  if (cleaned.length < 20) {
    return { ok: false, error: "Paste at least a few complete sentences." };
  }

  if (cleaned.length > 100_000) {
    return { ok: false, error: "Keep the test text under 100,000 characters." };
  }

  const sentences = cleaned
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((sentence) =>
      sentence
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((sentence) => sentence.length >= 3);

  if (sentences.length === 0) {
    return { ok: false, error: "No usable sentences were found in the text." };
  }

  if (sentences.length > 500) {
    return { ok: false, error: "Use 500 sentences or fewer for this test." };
  }

  if (sentences.some((sentence) => sentence.length > 2_000)) {
    return {
      ok: false,
      error: "One section is too long. Add full stops or line breaks to separate it.",
    };
  }

  return { ok: true, sentences };
}

export function parseBoundedInteger(
  value: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}
