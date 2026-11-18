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

/** A sentence from the material that a study-guide item is based on. */
export interface StudyGuideSource {
  readonly index: number;
  readonly text: string;
}

export interface StudyGuidePoint {
  readonly text: string;
  readonly sources: readonly StudyGuideSource[];
}

export interface StudyGuideCheck {
  readonly question: string;
  readonly answer: string;
}

export interface StudyGuideSection {
  readonly title: string;
  readonly summary: string;
  readonly key_points: readonly StudyGuidePoint[];
  readonly key_terms: readonly string[];
  readonly self_check: readonly StudyGuideCheck[];
  /** Indexes into the analysis topics that this section explains. */
  readonly topic_indexes: readonly number[];
}

export interface GlossaryEntry {
  readonly term: string;
  readonly definition: string;
  readonly sources: readonly StudyGuideSource[];
}

/**
 * Readable study notes Gemini writes from the NLP analysis. Every key point
 * and glossary entry cites the sentences it came from. Absent when no Gemini
 * key is configured, Gemini failed, or the analysis predates the feature.
 */
export interface StudyGuide {
  readonly overview: string;
  readonly sections: readonly StudyGuideSection[];
  readonly glossary: readonly GlossaryEntry[];
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
    readonly study_guide_model?: string | null;
  };
  readonly selection?: AnalysisSelection;
  readonly study_guide?: StudyGuide | null;
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

function recordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function guideSources(value: unknown): StudyGuideSource[] {
  return recordList(value).flatMap((item) =>
    typeof item.index === "number" && text(item.text)
      ? [{ index: item.index, text: text(item.text) }]
      : [],
  );
}

/**
 * Reads a stored study guide defensively: the column is JSON, so anything
 * malformed is dropped rather than breaking the page. Returns null when no
 * usable section remains, so the page falls back to the NLP results.
 */
export function parseStudyGuide(value: unknown): StudyGuide | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const guide = value as Record<string, unknown>;
  const sections: StudyGuideSection[] = recordList(guide.sections).flatMap((section) => {
    const keyPoints = recordList(section.key_points).flatMap((point) => {
      const sources = guideSources(point.sources);

      return text(point.text) && sources.length > 0
        ? [{ text: text(point.text), sources }]
        : [];
    });

    return text(section.title) && keyPoints.length > 0
      ? [
          {
            title: text(section.title),
            summary: text(section.summary),
            key_points: keyPoints,
            key_terms: Array.isArray(section.key_terms)
              ? section.key_terms.map(text).filter(Boolean)
              : [],
            self_check: recordList(section.self_check).flatMap((check) =>
              text(check.question) && text(check.answer)
                ? [{ question: text(check.question), answer: text(check.answer) }]
                : [],
            ),
            topic_indexes: Array.isArray(section.topic_indexes)
              ? section.topic_indexes.filter(
                  (index): index is number => Number.isSafeInteger(index),
                )
              : [],
          },
        ]
      : [];
  });

  if (sections.length === 0) {
    return null;
  }

  const glossary: GlossaryEntry[] = recordList(guide.glossary).flatMap((entry) => {
    const sources = guideSources(entry.sources);

    return text(entry.term) && text(entry.definition) && sources.length > 0
      ? [{ term: text(entry.term), definition: text(entry.definition), sources }]
      : [];
  });

  return { overview: text(guide.overview), sections, glossary };
}
