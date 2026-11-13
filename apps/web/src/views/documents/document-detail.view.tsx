import Link from "next/link";

import type { SavedContentAnalysis } from "@/models/analysis/content-analysis.model";
import type { DocumentContent, DocumentRecord } from "@/models/document/document.model";
import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import { SavedAnalysisResults } from "@/views/analysis/saved-analysis-results.view";
import {
  documentStatusLabels,
  documentTypeLabel,
  formatBytes,
  formatContentSummary,
  formatDocumentDate,
} from "@/views/documents/document-display";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface DocumentDetailViewProps {
  readonly viewer: Viewer;
  readonly document: DocumentRecord;
  readonly content: DocumentContent | null;
  readonly analysis: SavedContentAnalysis | null;
  readonly signOutAction: () => Promise<void>;
}

export function DocumentDetailView({
  viewer,
  document,
  content,
  analysis,
  signOutAction,
}: DocumentDetailViewProps) {
  const ready = document.status === "ready" && content !== null;

  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation("My Documents")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        avatarUrl={viewer.avatarUrl}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content document-detail-page">
        <Link className="text-action detail-back-link" href="/documents">
          <span aria-hidden="true">←</span> My Documents
        </Link>

        <header className="document-detail-header">
          <span className="document-type detail-document-type" aria-hidden="true">
            {documentTypeLabel(document.mimeType)}
          </span>
          <div>
            <p className="section-kicker">Learning material</p>
            <h1>{document.title}</h1>
            <p>
              {document.fileName} · {formatBytes(document.sizeBytes)} · Uploaded {formatDocumentDate(document.createdAt)}
            </p>
          </div>
          <span className={`status-chip ${document.status}`}>
            {documentStatusLabels[document.status]}
          </span>
        </header>

        {ready ? (
          <section className="document-detail-summary" aria-label="Material summary">
            <div>
              <span>Extracted text</span>
              <strong>{formatContentSummary(content)}</strong>
            </div>
            <div>
              <span>Analysis</span>
              <strong>{analysis ? "Saved and ready" : "Not analysed yet"}</strong>
            </div>
            <div>
              <span>Next step</span>
              <strong>{analysis ? "Create a quiz" : "Analyse this material"}</strong>
            </div>
          </section>
        ) : (
          <section className="document-detail-waiting">
            <span aria-hidden="true">◌</span>
            <div>
              <h2>
                {document.status === "failed"
                  ? "Text extraction needs attention"
                  : "Preparing your learning material"}
              </h2>
              <p>
                {document.status === "failed"
                  ? document.errorMessage ?? "Please return to My Documents and retry extraction."
                  : "Text extraction must finish before analysis and quiz generation are available."}
              </p>
            </div>
            <Link className="button button-outline" href="/documents">
              Back to documents
            </Link>
          </section>
        )}

        {ready && analysis ? (
          <section className="saved-analysis-page" aria-labelledby="saved-analysis-title">
            <div className="result-heading">
              <div>
                <h2 id="saved-analysis-title">Saved analysis</h2>
              </div>
              <span className="status-chip ready">Saved</span>
            </div>

            <div className="document-detail-actions">
              <Link className="button button-dark" href={`/quizzes?documentId=${document.id}`}>
                Create a quiz <span aria-hidden="true">→</span>
              </Link>
              <Link className="button button-outline" href={`/documents?documentId=${document.id}#analysis`}>
                Run analysis again
              </Link>
            </div>

            <SavedAnalysisResults result={analysis.result} />
          </section>
        ) : null}

        {ready && !analysis ? (
          <section className="document-detail-empty" aria-labelledby="analyse-material-title">
            <span className="module-icon blue" aria-hidden="true">✦</span>
            <div>
              <h2 id="analyse-material-title">Not analysed yet</h2>
              <p>
                Would you like to identify its main ideas, key sentences, topics and concepts now?
              </p>
            </div>
            <Link className="button button-dark" href={`/documents?documentId=${document.id}#analysis`}>
              Analyse this material <span aria-hidden="true">→</span>
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}
