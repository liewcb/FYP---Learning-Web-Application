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

/** How many results the analyser chose and why. Absent on older analyses. */
export interface AnalysisSelection {
  readonly automatic: boolean;
  readonly keyword_count: number;
  readonly important_sentence_count: number;
  readonly topic_count: number;
  readonly topic_silhouette: number | null;
  readonly notes: readonly string[];
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
  readonly selection?: AnalysisSelection;
}

/** The response from the trusted endpoint after it has written an analysis row. */
export interface PersistedContentAnalysisResult extends ContentAnalysisResult {
  readonly analysis_id: number;
}

/** A completed analysis that belongs to one of the student's documents. */
export interface SavedContentAnalysis {
  readonly id: number;
  readonly documentId: number;
  readonly result: ContentAnalysisResult;
  readonly completedAt: string;
}

/**
 * Only the sentences are required. Leaving the limits out lets the AI service
 * choose the counts from the material (keyword score drop-off, diminishing
 * returns for key sentences and silhouette score for topics).
 */
export interface ContentAnalysisRequest {
  readonly sentences: readonly string[];
  readonly top_keywords?: number;
  readonly top_sentences?: number;
  readonly max_topics?: number;
}

/** Pasted text is the only value a student supplies; the AI service sizes the analysis. */
export interface ContentAnalysisFormValues {
  readonly text: string;
}

export interface ContentAnalysisFormState {
  readonly error?: string;
  readonly result?: ContentAnalysisResult;
  readonly values?: ContentAnalysisFormValues;
  /** Present only when the analysis was saved against an uploaded document. */
  readonly savedAnalysisId?: number;
  /** Explains when a long document was sampled to fit the model limits. */
  readonly notice?: string;
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

  if (sentences.some((sentence) => sentence.length > 2_000)) {
    return {
      ok: false,
      error: "One section is too long. Add full stops or line breaks to separate it.",
    };
  }

  return { ok: true, sentences };
}

/** Request limits enforced by the AI service for analysis and quiz generation. */
export const maxModelSentences = 500;
export const maxModelCharacters = 100_000;

export interface SentenceSelection {
  readonly sentences: readonly string[];
  readonly originalCount: number;
  readonly trimmed: boolean;
}

function evenlySpaced<T>(items: readonly T[], count: number): T[] {
  if (count >= items.length) {
    return [...items];
  }

  return Array.from({ length: count }, (_value, index) =>
    items[Math.floor((index * items.length) / count)],
  );
}

function characterCount(sentences: readonly string[]): number {
  return sentences.reduce((total, sentence) => total + sentence.length, 0);
}

/**
 * Fits a long document into the AI service's request limits without making
 * the student cut text by hand. Short fragments (slide headings, labels) are
 * dropped first; if the material is still too long, sentences are sampled
 * evenly so the whole document is still covered, in its original order.
 */
export function selectRepresentativeSentences(
  sentences: readonly string[],
  limit = maxModelSentences,
  characterLimit = maxModelCharacters,
): SentenceSelection {
  const originalCount = sentences.length;

  if (originalCount <= limit && characterCount(sentences) <= characterLimit) {
    return { sentences, originalCount, trimmed: false };
  }

  const informative = sentences.filter(
    (sentence) => sentence.split(/\s+/).length >= 5,
  );
  const pool = informative.length >= Math.min(limit, 20) ? informative : [...sentences];
  let selected = evenlySpaced(pool, limit);

  while (selected.length > 1 && characterCount(selected) > characterLimit) {
    const ratio = characterLimit / characterCount(selected);
    selected = evenlySpaced(pool, Math.max(1, Math.floor(selected.length * ratio * 0.95)));
  }

  return { sentences: selected, originalCount, trimmed: true };
}

export function trimmedMaterialNotice(selection: SentenceSelection): string | undefined {
  return selection.trimmed
    ? `This material is long (${selection.originalCount} sentences), so ${selection.sentences.length} sentences spread across the whole document were used.`
    : undefined;
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
