import Link from "next/link";

import type { ManagedDocumentSummary } from "@/models/document/document.model";
import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import { formatBytes } from "@/views/documents/document-display";
import { DocumentManagerList } from "@/views/documents/document-manager-list.view";
import { DocumentTabs } from "@/views/documents/document-tabs.view";
import type { ManagedDocumentActions } from "@/views/documents/managed-document-row.view";
import { ProcessingRefresher } from "@/views/documents/processing-refresher.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface DocumentManagerViewProps extends ManagedDocumentActions {
  readonly viewer: Viewer;
  readonly documents: readonly ManagedDocumentSummary[];
  readonly signOutAction: () => Promise<void>;
}

export function DocumentManagerView({
  viewer,
  documents,
  processAction,
  renameAction,
  deleteAction,
  signOutAction,
}: DocumentManagerViewProps) {
  const totalBytes = documents.reduce((sum, document) => sum + document.sizeBytes, 0);
  const readyCount = documents.filter((document) => document.status === "ready").length;
  const attentionCount = documents.filter(
    (document) => document.status === "failed",
  ).length;

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
            <p className="section-kicker">Private workspace</p>
            <h1>Manage your uploaded materials.</h1>
            <p>
              Rename, download or remove the learning materials you have
              uploaded, and check that their text is ready for analysis and
              quizzes. Only you can see these files.
            </p>
          </div>
          <Link className="button button-outline" href="/documents">
            Upload new material <span aria-hidden="true">↑</span>
          </Link>
        </header>

        <DocumentTabs active="manage" documentCount={documents.length} />
        <ProcessingRefresher
          active={documents.some((document) => document.awaitingExtraction)}
        />

        <section
          className="quiz-summary-strip document-summary-strip"
          aria-label="Document summary"
        >
          <div>
            <strong>{documents.length}</strong>
            <span>Documents uploaded</span>
          </div>
          <div>
            <strong>{totalBytes > 0 ? formatBytes(totalBytes) : "0 KB"}</strong>
            <span>Storage used</span>
          </div>
          <div>
            <strong>{readyCount}</strong>
            <span>Ready for quizzes</span>
          </div>
          <div>
            <strong>{attentionCount}</strong>
            <span>Need attention</span>
          </div>
        </section>

        {documents.length > 0 ? (
          <DocumentManagerList
            documents={documents}
            processAction={processAction}
            renameAction={renameAction}
            deleteAction={deleteAction}
          />
        ) : (
          <article className="module-card">
            <div className="document-empty">
              <span aria-hidden="true">□</span>
              <strong>No documents yet</strong>
              <p>Upload a PDF or DOCX file to start building your library.</p>
              <Link className="button button-dark" href="/documents">
                Upload a document
              </Link>
            </div>
          </article>
        )}
      </div>
    </main>
  );
}
