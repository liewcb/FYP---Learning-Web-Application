import Link from "next/link";

import {
  contributorLabel,
  describeLibraryEvent,
  libraryStatusLabels,
  type LibraryDetailModel,
} from "@/models/library/library.model";
import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import { documentTypeLabel, formatBytes } from "@/views/documents/document-display";
import { formatLibraryDate, formatLibraryDateTime } from "@/views/library/library-display";
import { ReportButton } from "@/views/reports/report-button.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface LibraryDetailViewProps {
  readonly viewer: Viewer;
  readonly model: LibraryDetailModel;
  readonly signOutAction: () => Promise<void>;
}

export function LibraryDetailView({ viewer, model, signOutAction }: LibraryDetailViewProps) {
  const { material, events, isOwner } = model;
  const backHref = isOwner && material.status !== "published" ? "/library?tab=mine" : "/library";

  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation("Library")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        avatarUrl={viewer.avatarUrl}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content lib-detail">
        <Link className="text-action" href={backHref}>
          <span aria-hidden="true">←</span> Library
        </Link>

        <header className="document-detail-header">
          <span className="document-type detail-document-type" aria-hidden="true">
            {material.mimeType ? documentTypeLabel(material.mimeType) : "—"}
          </span>
          <div>
            <p className="section-kicker">
              {material.subjectName}
              {material.moduleCode ? ` · ${material.moduleCode}` : ""}
            </p>
            <h1>{material.title}</h1>
            <p>
              Shared by {contributorLabel(material, viewer)}
              {material.publishedAt
                ? ` · Published ${formatLibraryDate(material.publishedAt)}`
                : ` · Submitted ${formatLibraryDate(material.createdAt)}`}
            </p>
            {!isOwner && material.status === "published" ? (
              <ReportButton
                target={{ type: "library_material", id: material.id }}
                title="Report this material"
                label="Report material"
              />
            ) : null}
          </div>
          {isOwner || material.status !== "published" ? (
            <span className={`status-chip ${material.status}`}>
              {libraryStatusLabels[material.status]}
            </span>
          ) : null}
        </header>

        <section className="document-detail-summary" aria-label="Material summary">
          <div>
            <span>File</span>
            <strong>{material.fileName ?? "Not available"}</strong>
          </div>
          <div>
            <span>Size</span>
            <strong>{material.sizeBytes ? formatBytes(material.sizeBytes) : "—"}</strong>
          </div>
          <div>
            <span>Activity</span>
            <strong>
              {material.downloadCount} downloads · {material.viewCount} views
            </strong>
          </div>
        </section>

        {material.description ? (
          <section className="module-card">
            <h2 className="lib-section-title">About this material</h2>
            <p className="lib-description">{material.description}</p>
            {material.tags.length > 0 ? (
              <ul className="buddy-chips" aria-label="Tags">
                {material.tags.map((tag) => (
                  <li className="buddy-chip" key={tag}>
                    {tag}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {isOwner && material.reviewNote && material.status !== "published" ? (
          <p className="form-alert" role="status">
            <strong>Moderator feedback:</strong> {material.reviewNote}
          </p>
        ) : null}

        {material.fileName ? (
          <div className="document-detail-actions">
            <a className="button button-dark" href={`/library/${material.id}/download`}>
              Download <span aria-hidden="true">↓</span>
            </a>
            {isOwner && material.status === "rejected" ? (
              <Link
                className="button button-outline"
                href={
                  material.sourceDocumentId
                    ? `/library/submit?documentId=${material.sourceDocumentId}`
                    : "/library/submit"
                }
              >
                Submit again
              </Link>
            ) : null}
          </div>
        ) : null}

        {isOwner && events.length > 0 ? (
          <section className="module-card">
            <h2 className="lib-section-title">Submission history</h2>
            <ol className="lib-history">
              {events.map((event) => (
                <li key={event.id}>
                  <strong>{describeLibraryEvent(event)}</strong>
                  <time dateTime={event.createdAt}>{formatLibraryDateTime(event.createdAt)}</time>
                  {event.note ? <p>{event.note}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </main>
  );
}