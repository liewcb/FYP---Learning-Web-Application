"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import type {
  ContentAnalysisFormState,
  SavedContentAnalysis,
} from "@/models/analysis/content-analysis.model";
import type {
  DocumentStudySource,
  DocumentStudySourceOption,
} from "@/models/document/document.model";

interface ContentAnalysisTesterProps {
  readonly source: DocumentStudySource | null;
  readonly availableSources: readonly DocumentStudySourceOption[];
  readonly savedAnalysis: SavedContentAnalysis | null;
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

export function ContentAnalysisTester({
  action,
  source,
  availableSources,
  savedAnalysis,
}: ContentAnalysisTesterProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const router = useRouter();
  const values = state.values ?? { ...defaults, text: source?.text ?? "" };
  // After a new sign-in, the Server Action state is empty. The persisted
  // result restores the newest finished analysis for the selected document.
  const result = state.result ?? savedAnalysis?.result;
  const saved = state.savedAnalysisId !== undefined || savedAnalysis !== null;

  return (
    <section id="analysis" className="analysis-workspace" aria-labelledby="analysis-title">
      <form className="module-card analysis-form" action={formAction} noValidate>
        <div className="module-card-heading">
          <span className="module-icon blue" aria-hidden="true">✦</span>
          <div>
            <p className="section-kicker">Content analysis</p>
            <h2 id="analysis-title">
              {source ? "Analyse extracted material" : "Analyse learning content"}
            </h2>
          </div>
        </div>

        <p className="module-card-copy">
          {source
            ? `Extracted sentences from “${source.title}” are loaded below. You can review or edit them before running the NLP analysis.`
            : "Choose a ready document from your uploads, or add learning content below for analysis."}
        </p>

        {source ? (
          <div className="document-source-callout">
            <strong>{source.title}</strong>
            <span>{source.fileName} · {source.sentenceCount} extracted sentences</span>
          </div>
        ) : null}

        {source ? <input type="hidden" name="documentId" value={source.id} /> : null}

        <div className="form-field document-source-picker">
          <label htmlFor="analysis-document-source">Document to analyse</label>
          <select
            id="analysis-document-source"
            value={source?.id.toString() ?? ""}
            onChange={(event) => {
              const selectedId = event.target.value;
              router.push(
                selectedId
                  ? `/documents?documentId=${selectedId}#analysis`
                  : "/documents#analysis",
              );
            }}
          >
            <option value="">Add text manually</option>
            {availableSources.map((document) => (
              <option key={document.id} value={document.id}>
                {document.title} — {document.sentenceCount} sentences
              </option>
            ))}
          </select>
          <p className="field-hint">
            {availableSources.length > 0
              ? "Choose a Ready document to load its extracted text automatically."
              : "No documents are ready yet. Wait for extraction to finish, then refresh this page."}
          </p>
        </div>

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
            {source
              ? "This text came from your uploaded document and remains editable for this analysis."
              : "Paste content here, or choose a ready upload from the materials list above."}
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
                <p className="section-kicker">
                  {saved ? "Saved analysis" : "Analysis complete"}
                </p>
                <h2>{result.sentence_count} sentences understood</h2>
              </div>
              <span className="status-chip ready">{saved ? "Saved" : "Ready"}</span>
            </div>

            {saved ? (
              <p className="saved-result-note">
                This analysis is saved with your selected document and will be here next time you sign in.
              </p>
            ) : null}

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
              Select a document or add learning content to identify keywords,
              key sentences, topics and concepts. Analyses from an uploaded
              document are saved automatically.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
