import Link from "next/link";

import type {
  ContentAnalysisFormState,
  SavedContentAnalysis,
} from "@/models/analysis/content-analysis.model";
import type {
  DocumentRecord,
  DocumentStudySource,
  DocumentStudySourceOption,
  DocumentUploadFormState,
} from "@/models/document/document.model";
import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import { ContentAnalysisTester } from "@/views/analysis/content-analysis-tester.view";
import {
  documentStatusLabels,
  documentTypeLabel,
  formatBytes,
  formatContentSummary,
  formatDocumentDate,
} from "@/views/documents/document-display";
import { DocumentTabs } from "@/views/documents/document-tabs.view";
import { DocumentUploadView } from "@/views/documents/document-upload.view";
import { ProcessingRefresher } from "@/views/documents/processing-refresher.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface DocumentsViewProps {
  readonly viewer: Viewer;
  readonly documents: readonly DocumentRecord[];
  readonly awaitingExtraction: boolean;
  readonly analysisSource: DocumentStudySource | null;
  readonly availableAnalysisSources: readonly DocumentStudySourceOption[];
  readonly savedAnalysis: SavedContentAnalysis | null;
  readonly uploadAction: (
    state: DocumentUploadFormState,
    formData: FormData,
  ) => Promise<DocumentUploadFormState>;
  readonly analysisAction: (
    state: ContentAnalysisFormState,
    formData: FormData,
  ) => Promise<ContentAnalysisFormState>;
  readonly signOutAction: () => Promise<void>;
}

export function DocumentsView({
  viewer,
  documents,
  awaitingExtraction,
  analysisSource,
  availableAnalysisSources,
  savedAnalysis,
  uploadAction,
  analysisAction,
  signOutAction,
}: DocumentsViewProps) {
  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation("My Documents")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content">
        <header className="module-page-header">
          <div>
            <p className="section-kicker">Content Analysis Module</p>
            <h1>Turn your notes into clear learning insights.</h1>
            <p>
              Upload private learning material. Its text is extracted and
              cleaned automatically, ready for content analysis and quizzes.
            </p>
          </div>
          <Link className="button button-outline" href="/quizzes">
            Open quiz generator <span aria-hidden="true">→</span>
          </Link>
        </header>

        <DocumentTabs active="workspace" documentCount={documents.length} />
        <ProcessingRefresher active={awaitingExtraction} />

        <section className="process-strip" aria-label="Document processing stages">
          <div className="complete">
            <span>1</span>
            <strong>Upload</strong>
            <small>Working now</small>
          </div>
          <div className="complete">
            <span>2</span>
            <strong>Extract text</strong>
            <small>Automatic after upload</small>
          </div>
          <div className="active">
            <span>3</span>
            <strong>Analyse</strong>
            <small>Ready documents can be analysed</small>
          </div>
          <div className="active">
            <span>4</span>
            <strong>Generate quiz</strong>
            <small>Ready documents can create quizzes</small>
          </div>
        </section>

        <section className="document-grid" aria-label="Document workspace">
          <DocumentUploadView action={uploadAction} />

          <article className="module-card document-library-card">
            <div className="module-card-heading">
              <span className="module-icon amber" aria-hidden="true">▤</span>
              <div>
                <p className="section-kicker">Private workspace</p>
                <h2>Your uploaded materials</h2>
              </div>
              {documents.length > 0 ? (
                <Link className="text-action module-card-link" href="/documents/manage">
                  Manage all <span aria-hidden="true">→</span>
                </Link>
              ) : null}
            </div>

            {documents.length > 0 ? (
              <ul className="document-list">
                {documents.map((document) => (
                  <li key={document.id}>
                    <span className="document-type" aria-hidden="true">
                      {documentTypeLabel(document.mimeType)}
                    </span>
                    <div>
                      <Link className="document-title-link" href={`/documents/${document.id}`}>
                        <strong>{document.title}</strong>
                      </Link>
                      <p>
                        {document.status === "ready" && document.content
                          ? formatContentSummary(document.content)
                          : document.fileName}{" "}
                        · {formatBytes(document.sizeBytes)} ·{" "}
                        {formatDocumentDate(document.createdAt)}
                      </p>
                      {document.status === "ready" ? (
                        <div className="document-row-actions">
                          <Link href={`/documents/${document.id}`}>
                            View material <span aria-hidden="true">→</span>
                          </Link>
                          <Link href={`/quizzes?documentId=${document.id}`}>
                            Make a quiz <span aria-hidden="true">→</span>
                          </Link>
                        </div>
                      ) : null}
                    </div>
                    <span className={`status-chip ${document.status}`}>
                      {documentStatusLabels[document.status]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="document-empty">
                <span aria-hidden="true">□</span>
                <strong>No documents yet</strong>
                <p>Your first private upload will appear here.</p>
              </div>
            )}
          </article>
        </section>

        <ContentAnalysisTester
          key={analysisSource?.id ?? "manual-analysis"}
          action={analysisAction}
          source={analysisSource}
          availableSources={availableAnalysisSources}
          savedAnalysis={savedAnalysis}
        />
      </div>
    </main>
  );
}
