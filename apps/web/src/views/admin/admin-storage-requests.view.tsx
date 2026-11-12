import Link from "next/link";

import { formatStorage, percentOf } from "@/models/admin/system-monitoring.model";
import {
  adminStorageRequestFilterLabels,
  adminStorageRequestFilters,
  adminStorageRequestsPath,
  maxStorageQuotaBytes,
  storageRequestStatusLabels,
  type AdminStorageRequestsModel,
  type StorageRequestStatus,
} from "@/models/storage/storage-request.model";
import { formatAdminDateTime } from "@/views/admin/admin-display";
import {
  StorageRequestDecision,
  type StorageDecisionAction,
} from "@/views/admin/storage-request-decision.view";

interface AdminStorageRequestsViewProps {
  readonly model: AdminStorageRequestsModel;
  readonly decideAction: StorageDecisionAction;
}

const statusChip: Record<StorageRequestStatus, string> = {
  pending: "processing",
  approved: "ready",
  rejected: "failed",
  cancelled: "uploaded",
};

const emptyMessages: Record<string, string> = {
  pending: "No storage requests are waiting. Students can ask for more space from their profile.",
  approved: "No requests have been approved yet.",
  rejected: "No requests have been rejected.",
  all: "No storage requests yet.",
};

export function AdminStorageRequestsView({ model, decideAction }: AdminStorageRequestsViewProps) {
  return (
    <>
      <section className="admin-heading">
        <p className="section-kicker">Administration</p>
        <h1>Storage requests</h1>
        <p>
          Students ask for extra space here. Approving adds the requested
          amount to their quota; every decision is recorded in the audit log.
        </p>
      </section>

      <nav className="page-tabs" aria-label="Storage request queues">
        {adminStorageRequestFilters.map((filter) => (
          <Link
            key={filter}
            className={filter === model.filter ? "page-tab active" : "page-tab"}
            href={filter === "pending" ? adminStorageRequestsPath : `${adminStorageRequestsPath}?status=${filter}`}
            aria-current={filter === model.filter ? "page" : undefined}
          >
            {adminStorageRequestFilterLabels[filter]}
            {filter === "pending" ? <span className="page-tab-count">{model.pendingCount}</span> : null}
          </Link>
        ))}
      </nav>

      {model.requests.length > 0 ? (
        <ul className="lib-review-list">
          {model.requests.map((request) => {
            const newQuota = request.currentQuotaBytes + request.requestedBytes;
            const usedPercent = percentOf(request.currentUsedBytes, request.currentQuotaBytes);
            const overMax = newQuota > maxStorageQuotaBytes;

            return (
              <li className="lib-review-card" key={request.id}>
                <div className="lib-card-top">
                  <span className="document-type" aria-hidden="true">⬒</span>
                  <div className="lib-card-title">
                    <strong>
                      {request.userName} asks for +{formatStorage(request.requestedBytes)}
                    </strong>
                    <small>
                      {request.username ? `@${request.username} · ` : ""}
                      {request.email ? `${request.email} · ` : ""}
                      {formatAdminDateTime(request.createdAt)}
                      {request.accountStatus === "suspended" ? " · account suspended" : ""}
                    </small>
                  </div>
                  <span className={`status-chip ${statusChip[request.status]}`}>
                    {storageRequestStatusLabels[request.status]}
                  </span>
                </div>

                <blockquote className="admin-quoted-post">{request.reason}</blockquote>

                <dl className="admin-user-facts">
                  <div>
                    <dt>Using now</dt>
                    <dd>
                      <span className={usedPercent >= 80 ? "is-warning" : ""}>
                        {formatStorage(request.currentUsedBytes)} of {formatStorage(request.currentQuotaBytes)} ({usedPercent}%)
                      </span>
                      <span className={`admin-meter${usedPercent >= 80 ? " is-warning" : ""}`} aria-hidden="true">
                        <span style={{ width: `${Math.min(100, usedPercent)}%` }} />
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>At request time</dt>
                    <dd>{formatStorage(request.usedAtRequest)} of {formatStorage(request.quotaAtRequest)}</dd>
                  </div>
                  <div>
                    <dt>{request.status === "approved" ? "Quota now" : "Quota if approved"}</dt>
                    <dd>{formatStorage(request.grantedQuotaBytes ?? newQuota)}</dd>
                  </div>
                </dl>

                {request.status === "pending" ? (
                  overMax ? (
                    <p className="form-alert">
                      Approving would exceed the 10 GB maximum. Reject it with a note, or lower the
                      student&apos;s quota first in User management.
                    </p>
                  ) : (
                    <StorageRequestDecision
                      requestId={request.id}
                      approveLabel={`Approve +${formatStorage(request.requestedBytes)}`}
                      action={decideAction}
                    />
                  )
                ) : request.reviewedAt ? (
                  <p className="lib-review-meta">
                    {storageRequestStatusLabels[request.status]}
                    {request.reviewerName ? ` by ${request.reviewerName}` : ""} ·{" "}
                    {formatAdminDateTime(request.reviewedAt)}
                    {request.reviewNote ? ` · “${request.reviewNote}”` : ""}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="admin-empty">
          <span className="admin-module-icon" aria-hidden="true">⬒</span>
          <h2>Nothing here</h2>
          <p>{emptyMessages[model.filter]}</p>
        </section>
      )}
    </>
  );
}
