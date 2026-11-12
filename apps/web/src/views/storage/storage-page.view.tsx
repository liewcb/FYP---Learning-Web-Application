import Link from "next/link";

import { formatStorage, percentOf } from "@/models/admin/system-monitoring.model";
import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import {
  storageRequestStatusLabels,
  type StoragePageModel,
  type StorageRequestStatus,
} from "@/models/storage/storage-request.model";
import { formatAdminDate } from "@/views/admin/admin-display";
import {
  CancelStorageRequestButton,
  StorageRequestForm,
  type StorageRequestAction,
} from "@/views/storage/storage-request-forms.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface StoragePageViewProps {
  readonly viewer: Viewer;
  readonly model: StoragePageModel;
  readonly requestAction: StorageRequestAction;
  readonly cancelAction: StorageRequestAction;
  readonly signOutAction: () => Promise<void>;
}

const statusChip: Record<StorageRequestStatus, string> = {
  pending: "processing",
  approved: "ready",
  rejected: "failed",
  cancelled: "uploaded",
};

export function StoragePageView({
  viewer,
  model,
  requestAction,
  cancelAction,
  signOutAction,
}: StoragePageViewProps) {
  const { usage, pending } = model;
  const percent = percentOf(usage.usedBytes, usage.quotaBytes);
  const tone = percent >= 90 ? " is-critical" : percent >= 80 ? " is-warning" : "";
  const history = model.requests.filter((request) => request.status !== "pending");

  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation()}
        displayName={viewer.displayName}
        initials={viewer.initials}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content storage-page">
        <Link className="text-action" href="/profile">
          <span aria-hidden="true">←</span> Profile
        </Link>

        <header className="module-page-header">
          <div>
            <p className="section-kicker">My storage</p>
            <h1>Your space for learning materials.</h1>
            <p>
              Uploaded documents count towards your storage quota. If you run
              low, ask an administrator for more space.
            </p>
          </div>
        </header>

        <div className="storage-layout">
          <section className="module-card" aria-labelledby="usage-title">
            <h2 id="usage-title" className="lib-section-title">Usage</h2>
            <p className="storage-usage-figure">
              <span>
                <strong>{formatStorage(usage.usedBytes)}</strong> of {formatStorage(usage.quotaBytes)} used
              </span>
              <span>{percent}%</span>
            </p>
            <span
              className={`admin-meter large${tone}`}
              role="img"
              aria-label={`${percent} percent of your storage used`}
            >
              <span style={{ width: `${Math.min(100, percent)}%` }} />
            </span>
            <p className="field-hint">
              {formatStorage(Math.max(0, usage.quotaBytes - usage.usedBytes))} left.{" "}
              <Link href="/documents/manage">Manage documents</Link> to free up space.
            </p>
          </section>

          <section className="module-card" aria-labelledby="request-title">
            <h2 id="request-title" className="lib-section-title">Request more storage</h2>
            {pending ? (
              <div className="storage-pending">
                <span className="status-chip processing">Waiting for review</span>
                <p>
                  You asked for <strong>+{formatStorage(pending.requestedBytes)}</strong> on{" "}
                  {formatAdminDate(pending.createdAt)}.
                </p>
                <blockquote>{pending.reason}</blockquote>
                <CancelStorageRequestButton action={cancelAction} requestId={pending.id} />
              </div>
            ) : model.availableAmounts.length > 0 ? (
              <StorageRequestForm action={requestAction} amounts={model.availableAmounts} />
            ) : (
              <p className="field-hint">You already have the maximum storage quota of 10 GB.</p>
            )}
          </section>
        </div>

        {history.length > 0 ? (
          <section className="module-card storage-history" aria-labelledby="history-title">
            <h2 id="history-title" className="lib-section-title">Past requests</h2>
            <ul>
              {history.map((request) => (
                <li key={request.id}>
                  <div>
                    <strong>+{formatStorage(request.requestedBytes)}</strong>
                    <span>Requested {formatAdminDate(request.createdAt)}</span>
                  </div>
                  <span className={`status-chip ${statusChip[request.status]}`}>
                    {storageRequestStatusLabels[request.status]}
                  </span>
                  {request.status === "approved" && request.grantedQuotaBytes ? (
                    <p>Your quota was raised to {formatStorage(request.grantedQuotaBytes)}.</p>
                  ) : null}
                  {request.reviewNote ? (
                    <p><b>Administrator note:</b> {request.reviewNote}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
