import Link from "next/link";

import type { ContentAnalysisFormState } from "@/models/analysis/content-analysis.model";
import type {
  DocumentRecord,
  DocumentStatus,
  DocumentUploadFormState,
} from "@/models/document/document.model";
import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import { ContentAnalysisTester } from "@/views/analysis/content-analysis-tester.view";
import { DocumentUploadView } from "@/views/documents/document-upload.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface DocumentsViewProps {
  readonly viewer: Viewer;
  readonly documents: readonly DocumentRecord[];
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

const statusLabels: Record<DocumentStatus, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  ready: "Ready",
  failed: "Needs attention",
};

const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsView({
  viewer,
  documents,
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
              Upload private learning material, then test the NLP pipeline with
              extracted text while the automatic document bridge is completed.
            </p>
          </div>
          <Link className="button button-outline" href="/quizzes">
            Open quiz generator <span aria-hidden="true">→</span>
          </Link>
        </header>

        <section className="process-strip" aria-label="Document processing stages">
          <div className="complete">
            <span>1</span>
            <strong>Upload</strong>
            <small>Working now</small>
          </div>
          <div>
            <span>2</span>
            <strong>Extract text</strong>
            <small>Shim&apos;s module</small>
          </div>
          <div className="active">
            <span>3</span>
            <strong>Analyse</strong>
            <small>Test by pasting text</small>
          </div>
          <div>
            <span>4</span>
            <strong>Generate quiz</strong>
            <small>Available next</small>
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
            </div>

            {documents.length > 0 ? (
              <ul className="document-list">
                {documents.map((document) => (
                  <li key={document.id}>
                    <span className="document-type" aria-hidden="true">
                      {document.mimeType === "application/pdf" ? "PDF" : "DOC"}
                    </span>
                    <div>
                      <strong>{document.title}</strong>
                      <p>
                        {document.fileName} · {formatBytes(document.sizeBytes)} ·{" "}
                        {dateFormatter.format(new Date(document.createdAt))}
                      </p>
                    </div>
                    <span className={`status-chip ${document.status}`}>
                      {statusLabels[document.status]}
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

        <ContentAnalysisTester action={analysisAction} />
      </div>
    </main>
  );
}
