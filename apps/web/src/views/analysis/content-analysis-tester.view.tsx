"use client";

import { useActionState, useState } from "react";
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

type SourceMode = "upload" | "paste";

const analysedDateFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kuala_Lumpur",
});

function formatAnalysedAt(value: string): string | null {
  const time = Date.parse(value);

  return Number.isNaN(time) ? null : analysedDateFormatter.format(new Date(time));
}

export function ContentAnalysisTester({
  action,
  source,
  availableSources,
  savedAnalysis,
}: ContentAnalysisTesterProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [mode, setMode] = useState<SourceMode>(
    source || availableSources.length > 0 ? "upload" : "paste",
  );
  const router = useRouter();
  const pastedText = state.values?.text ?? "";
  // After a new sign-in, the Server Action state is empty. The persisted
  // result restores the newest finished analysis for the selected document.
  const result = state.result ?? savedAnalysis?.result;
  const saved = state.savedAnalysisId !== undefined || savedAnalysis !== null;
  const analysedAt = savedAnalysis ? formatAnalysedAt(savedAnalysis.completedAt) : null;
  const alreadyAnalysed = mode === "upload" && source !== null && savedAnalysis !== null;
  const canSubmit = mode === "paste" || source !== null;

  function chooseDocument(selectedId: string) {
    router.push(
      selectedId ? `/documents?documentId=${selectedId}#analysis` : "/documents#analysis",
    );
  }

  return (
    <section id="analysis" className="analysis-workspace" aria-labelledby="analysis-title">
      <form className="module-card analysis-form" action={formAction} noValidate>
        <div className="module-card-heading">
          <span className="module-icon blue" aria-hidden="true">✦</span>
          <div>
            <h2 id="analysis-title">Analyse a document</h2>
          </div>
        </div>

        <p className="module-card-copy">
          Find a material&apos;s key terms, key sentences and main topics.
        </p>

        <div className="source-switch" role="tablist" aria-label="Material source">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            className={mode === "upload" ? "active" : ""}
            onClick={() => setMode("upload")}
          >
            My uploads
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "paste"}
            className={mode === "paste" ? "active" : ""}
            onClick={() => setMode("paste")}
          >
            Paste text
          </button>
        </div>

        {state.error ? (
          <p className="form-alert" role="alert">{state.error}</p>
        ) : null}

        {state.notice ? (
          <p className="quiz-local-note" role="status">{state.notice}</p>
        ) : null}

        {mode === "upload" ? (
          availableSources.length > 0 ? (
            <>
              <div className="form-field document-source-picker">
                <label htmlFor="analysis-document-source">Material</label>
                <select
                  id="analysis-document-source"
                  value={source?.id.toString() ?? ""}
                  disabled={pending}
                  onChange={(event) => chooseDocument(event.target.value)}
                >
                  <option value="">Choose a document…</option>
                  {availableSources.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title}
                    </option>
                  ))}
                </select>
              </div>

              {source ? (
                <div className="document-source-callout">
                  <strong>{source.title}</strong>
                  <span>
                    {source.fileName} · {source.sentenceCount} sentences extracted
                  </span>
                  <span className={`analysis-state${savedAnalysis ? " done" : ""}`}>
                    {savedAnalysis
                      ? `Analysed${analysedAt ? ` ${analysedAt}` : ""} — results are on the right`
                      : "Not analysed yet"}
                  </span>
                </div>
              ) : (
                <p className="field-hint">
                  Only Ready documents are listed.
                </p>
              )}

              {source ? (
                <input type="hidden" name="documentId" value={source.id} />
              ) : null}
            </>
          ) : (
            <div className="analysis-no-sources">
              <strong>No ready documents yet</strong>
              <p>
                Nothing is ready yet. Upload a note above, or paste text.
              </p>
            </div>
          )
        ) : null}

        {/* Kept mounted so pasted text survives switching tabs; disabled
            fields are not submitted. */}
        <div className="form-field" hidden={mode !== "paste"}>
          <label htmlFor="analysis-text">Learning content</label>
          <textarea
            id="analysis-text"
            name="text"
            rows={8}
            defaultValue={pastedText}
            placeholder="Paste a few paragraphs from your lecture notes..."
            maxLength={100_000}
            disabled={pending || mode !== "paste"}
            required
          />
          <p className="field-hint">
            Pasted text is not saved.
          </p>
        </div>

        <button
          className={alreadyAnalysed ? "button button-outline" : "button button-dark"}
          type="submit"
          disabled={pending || !canSubmit}
        >
          {pending
            ? "Analysing..."
            : alreadyAnalysed
              ? "Analyse again"
              : mode === "upload"
                ? "Analyse material"
                : "Analyse text"}
        </button>
        {pending ? (
          <p className="pending-note" role="status">
            Usually a few seconds. The first run takes longer.
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

            {result.selection ? (
              <details className="analysis-selection">
                <summary>
                  {result.selection.keyword_count} key terms ·{" "}
                  {result.selection.important_sentence_count} key sentences ·{" "}
                  {result.selection.topic_count}{" "}
                  {result.selection.topic_count === 1 ? "topic" : "topics"}
                  {result.selection.automatic ? ", sized automatically" : ""}
                  <span>How were these chosen?</span>
                </summary>
                <ul>
                  {result.selection.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </details>
            ) : null}

            {saved ? (
              <p className="saved-result-note">
                Saved with this document.
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
              Choose a document and press Analyse to see its key terms,
              sentences and topics.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
