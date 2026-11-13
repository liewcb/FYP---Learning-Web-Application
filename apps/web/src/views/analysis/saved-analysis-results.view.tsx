import type { ContentAnalysisResult } from "@/models/analysis/content-analysis.model";

interface SavedAnalysisResultsProps {
  readonly result: ContentAnalysisResult;
  /** When given, key sentences become buttons that jump to them in the text. */
  readonly onSentence?: (sentenceIndex: number) => void;
}

/** Keywords, key sentences, topics and concepts of a saved content analysis. */
export function SavedAnalysisResults({ result, onSentence }: SavedAnalysisResultsProps) {
  return (
    <div className="document-detail-results">
      <article className="result-card">
        <h3>Keywords</h3>
        <div className="keyword-cloud">
          {result.semantic_keywords.map((keyword) => (
            <span key={`${keyword.method}-${keyword.term}`}>
              {keyword.term}<small>{Math.round(keyword.score * 100)}%</small>
            </span>
          ))}
        </div>
      </article>

      <article className="result-card">
        <h3>Key sentences</h3>
        <ol className="important-sentence-list">
          {result.important_sentences.map((sentence) => (
            <li key={sentence.original_index}>
              {onSentence ? (
                <button
                  className="analysis-sentence-link"
                  type="button"
                  onClick={() => onSentence(sentence.original_index)}
                >
                  {sentence.text}
                </button>
              ) : (
                sentence.text
              )}
            </li>
          ))}
        </ol>
      </article>

      <article className="result-card">
        <h3>Topics</h3>
        <div className="topic-grid">
          {result.topics.map((topic) => (
            <div key={`${topic.label}-${topic.sentence_indexes.join("-")}`}>
              <strong>{topic.label}</strong>
              <span>{topic.sentences.length} sentences</span>
              <p>{topic.keywords.join(" · ")}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="result-card">
        <h3>Concepts</h3>
        <div className="concept-list">
          {result.concepts.slice(0, 16).map((concept) => (
            <span key={`${concept.kind}-${concept.term}`}>{concept.term}</span>
          ))}
        </div>
      </article>
    </div>
  );
}
