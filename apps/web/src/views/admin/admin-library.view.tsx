import Link from "next/link";

import {
  libraryReviewFilters,
  libraryStatusLabels,
  type LibraryReviewFilter,
  type LibraryReviewModel,
} from "@/models/library/library.model";
import { documentTypeLabel, formatBytes } from "@/views/documents/document-display";
import {
  LibraryReviewActions,
  type LibraryReviewAction,
} from "@/views/admin/library-review-actions.view";
import { formatLibraryDateTime } from "@/views/library/library-display";

interface AdminLibraryViewProps {
  readonly model: LibraryReviewModel;
  readonly reviewAction: LibraryReviewAction;
}

const emptyMessages: Record<LibraryReviewFilter, string> = {
  pending_review: "Nothing is waiting for review. New submissions will appear here.",
  published: "No materials are published yet.",
  rejected: "No materials have been rejected.",
  archived: "No materials have been archived.",
};

export function AdminLibraryView({ model, reviewAction }: AdminLibraryViewProps) {
  return (
    <>
      <section className="admin-heading">
        <p className="section-kicker">Administration</p>
        <h1>Learning library</h1>
        <p>
          Review student submissions, publish approved materials and archive anything that
          should no longer be shared. Every decision is recorded in the audit log.
        </p>
      </section>

      <nav className="page-tabs" aria-label="Library review queues">
        {libraryReviewFilters.map((filter) => (
          <Link
            key={filter}
            className={filter === model.filter ? "page-tab active" : "page-tab"}
            href={`/admin/library?status=${filter}`}
            aria-current={filter === model.filter ? "page" : undefined}
          >
            {libraryStatusLabels[filter]}
            <span className="page-tab-count">{model.counts[filter]}</span>
          </Link>
        ))}
      </nav>

      {model.materials.length > 0 ? (
        <ul className="lib-review-list">
          {model.materials.map((material) => (
            <li className="lib-review-card" key={material.id}>
              <div className="lib-card-top">
                <span className="document-type" aria-hidden="true">
                  {material.mimeType ? documentTypeLabel(material.mimeType) : "—"}
                </span>
                <div className="lib-card-title">
                  <strong>{material.title}</strong>
                  <small>
                    {material.subjectName}
                    {material.moduleCode ? ` · ${material.moduleCode}` : ""}
                  </small>
                </div>
                <span className={`status-chip ${material.status}`}>
                  {libraryStatusLabels[material.status]}
                </span>
              </div>

              <p className="lib-review-meta">
                By {material.submitterName} · Submitted {formatLibraryDateTime(material.createdAt)}
                {material.fileName ? ` · ${material.fileName}` : ""}
                {material.sizeBytes ? ` · ${formatBytes(material.sizeBytes)}` : ""}
              </p>

              {material.description ? (
                <p className="lib-card-description">{material.description}</p>
              ) : null}

              {material.tags.length > 0 ? (
                <ul className="buddy-chips" aria-label="Tags">
                  {material.tags.map((tag) => (
                    <li className="buddy-chip" key={tag}>
                      {tag}
                    </li>
                  ))}
                </ul>
              ) : null}

              {material.reviewNote ? (
                <p className="lib-card-feedback">
                  <strong>Reviewer note:</strong> {material.reviewNote}
                  {material.reviewedAt ? ` (${formatLibraryDateTime(material.reviewedAt)})` : ""}
                </p>
              ) : null}

              {material.fileName ? (
                <a
                  className="text-action"
                  href={`/library/${material.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download file to review ↓
                </a>
              ) : null}

              <LibraryReviewActions
                materialId={material.id}
                status={material.status}
                action={reviewAction}
              />
            </li>
          ))}
        </ul>
      ) : (
        <section className="admin-empty">
          <span className="admin-module-icon" aria-hidden="true">
            ▤
          </span>
          <h2>Nothing here</h2>
          <p>{emptyMessages[model.filter]}</p>
        </section>
      )}
    </>
  );
}