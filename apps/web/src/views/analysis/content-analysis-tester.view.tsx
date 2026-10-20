"use client";

import { useActionState } from "react";

import type { ContentAnalysisFormState } from "@/models/analysis/content-analysis.model";

interface ContentAnalysisTesterProps {
  readonly action: (
    state: ContentAnalysisFormState,
    formData: FormData,
  ) => Promise<ContentAnalysisFormState>;
}

const defaults = {
  text: "",
  topKeywords: "10",
  topSentences: "5",
  maxTopics: "5",
};

export function ContentAnalysisTester({ action }: ContentAnalysisTesterProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaults;
  const result = state.result;

  return (
    <section className="analysis-workspace" aria-labelledby="analysis-test-title">
      <form className="module-card analysis-form" action={formAction} noValidate>
        <div className="module-card-heading">
          <span className="module-icon blue" aria-hidden="true">✦</span>
          <div>
            <p className="section-kicker">Temporary test bridge</p>
            <h2 id="analysis-test-title">Analyse pasted text</h2>
          </div>
        </div>

        <p className="module-card-copy">
          Until automatic extraction is connected, paste the text from your
          notes here to test the real NLP analysis service.
        </p>

        {state.error ? (
          <p className="form-alert" role="alert">{state.error}</p>
        ) : null}

        <div className="form-field">
          <label htmlFor="analysis-text">Learning content</label>
          <textarea
            id="analysis-text"
            name="text"
            rows={12}
            defaultValue={values.text}
            placeholder="Paste several complete sentences from a lecture note..."
            maxLength={100_000}
            required
          />
          <p className="field-hint">
            Results are shown for testing and are not saved to Supabase yet.
          </p>
        </div>

        <div className="analysis-options">
          <div className="form-field">
            <label htmlFor="top-keywords">Keywords</label>
            <input
              id="top-keywords"
              name="topKeywords"
              type="number"
              min="1"
              max="30"
              defaultValue={values.topKeywords}
            />
          </div>
          <div className="form-field">
            <label htmlFor="top-sentences">Key sentences</label>
            <input
              id="top-sentences"
              name="topSentences"
              type="number"
              min="1"
              max="20"
              defaultValue={values.topSentences}
            />
          </div>
          <div className="form-field">
            <label htmlFor="max-topics">Topics</label>
            <input
              id="max-topics"
              name="maxTopics"
              type="number"
              min="1"
              max="10"
              defaultValue={values.maxTopics}
            />
          </div>
        </div>

        <button className="button button-dark" type="submit" disabled={pending}>
          {pending ? "Analysing content..." : "Run content analysis"}
        </button>
        {pending ? (
          <p className="pending-note" role="status">
            The first run may take longer while the NLP models load.
          </p>
        ) : null}
      </form>

      <div className="analysis-results" aria-live="polite">
        {result ? (
          <>
            <div className="result-heading">
              <div>
                <p className="section-kicker">Analysis complete</p>
                <h2>{result.sentence_count} sentences understood</h2>
              </div>
              <span className="status-chip ready">Ready</span>
            </div>

            <article className="result-card">
              <h3>Semantic keywords</h3>
              <div className="keyword-cloud">
                {result.semantic_keywords.map((keyword) => (
                  <span key={`${keyword.method}-${keyword.term}`}>
                    {keyword.term}
                    <small>{Math.round(keyword.score * 100)}%</small>
                  </span>
                ))}
              </div>
            </article>

            <article className="result-card">
              <h3>Important sentences</h3>
              <ol className="important-sentence-list">
                {result.important_sentences.map((sentence) => (
                  <li key={sentence.original_index}>{sentence.text}</li>
                ))}
              </ol>
            </article>

            <article className="result-card">
              <h3>Detected topics</h3>
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
          </>
        ) : (
          <div className="result-empty">
            <span aria-hidden="true">◎</span>
            <h2>Your analysis will appear here</h2>
            <p>
              Run the tester to see semantic keywords, important sentences,
              topic clusters and concepts returned by the Python service.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
