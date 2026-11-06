import Link from "next/link";

import {
  contributorLabel,
  libraryStatusLabels,
  type LibraryMaterial,
} from "@/models/library/library.model";
import type { Viewer } from "@/models/profile/profile.model";
import { documentTypeLabel } from "@/views/documents/document-display";
import { formatLibraryDate } from "@/views/library/library-display";

interface LibraryMaterialCardProps {
  readonly material: LibraryMaterial;
  readonly viewer: Viewer;
  /** Show the moderation status and feedback (My submissions tab). */
  readonly showStatus?: boolean;
}

export function LibraryMaterialCard({
  material,
  viewer,
  showStatus = false,
}: LibraryMaterialCardProps) {
  const feedback =
    showStatus && material.reviewNote && material.status !== "published"
      ? material.reviewNote
      : null;

  return (
    <article className="lib-card">
      <div className="lib-card-top">
        <span className="document-type" aria-hidden="true">
          {material.mimeType ? documentTypeLabel(material.mimeType) : "—"}
        </span>
        <div className="lib-card-title">
          <Link href={`/library/${material.id}`}>
            <strong>{material.title}</strong>
          </Link>
          <small>
            {material.subjectName}
            {material.moduleCode ? ` · ${material.moduleCode}` : ""}
          </small>
        </div>
        {showStatus ? (
          <span className={`status-chip ${material.status}`}>
            {libraryStatusLabels[material.status]}
          </span>
        ) : null}
      </div>

      {material.description ? <p className="lib-card-description">{material.description}</p> : null}

      {material.tags.length > 0 ? (
        <ul className="buddy-chips" aria-label="Tags">
          {material.tags.map((tag) => (
            <li className="buddy-chip" key={tag}>
              {tag}
            </li>
          ))}
        </ul>
      ) : null}

      {feedback ? (
        <p className="lib-card-feedback">
          <strong>Moderator feedback:</strong> {feedback}
        </p>
      ) : null}

      <div className="lib-card-footer">
        <span>
          {showStatus
            ? `Submitted ${formatLibraryDate(material.createdAt)}`
            : `By ${contributorLabel(material, viewer)}`}
        </span>
        {material.status === "published" ? (
          <span>
            {material.downloadCount} download{material.downloadCount === 1 ? "" : "s"} ·{" "}
            {material.viewCount} view{material.viewCount === 1 ? "" : "s"}
          </span>
        ) : null}
        <Link className="text-action" href={`/library/${material.id}`}>
          View details
        </Link>
      </div>
    </article>
  );
}