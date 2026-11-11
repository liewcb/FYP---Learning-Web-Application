import Link from "next/link";

import {
  adminForumPath,
  forumContentStatuses,
  forumModerationTabLabels,
  forumModerationTabs,
  forumReportStatuses,
  moderatedStatusLabels,
  reportStatusLabels,
  type ForumModerationModel,
  type ModeratedStatus,
} from "@/models/admin/forum-moderation.model";
import {
  ForumModerationActions,
  type ModerationFormAction,
} from "@/views/admin/forum-moderation-actions.view";
import { excerpt, formatAdminDateTime } from "@/views/admin/admin-display";

interface AdminForumViewProps {
  readonly model: ForumModerationModel;
  readonly moderateAction: ModerationFormAction;
  readonly dismissAction: ModerationFormAction;
}

const statusFilterLabels: Record<string, string> = {
  all: "All",
  published: "Published",
  hidden: "Hidden",
  deleted: "Removed",
  pending: "Pending",
  actioned: "Actioned",
  dismissed: "Dismissed",
};

const chipClass: Record<ModeratedStatus, string> = {
  published: "ready",
  hidden: "processing",
  deleted: "failed",
};

function StatusChip({ status }: { readonly status: ModeratedStatus }) {
  return <span className={`status-chip ${chipClass[status]}`}>{moderatedStatusLabels[status]}</span>;
}

export function AdminForumView({ model, moderateAction, dismissAction }: AdminForumViewProps) {
  const { filters } = model;
  const statuses = model.tab === "reports" ? forumReportStatuses : forumContentStatuses;

  return (
    <>
      <section className="admin-heading">
        <p className="section-kicker">Administration</p>
        <h1>Forum moderation</h1>
        <p>
          Review posts that students reported, and hide or remove anything that
          breaks the community rules. Hidden and removed posts are kept for the
          record and can be restored.
        </p>
      </section>

      <nav className="page-tabs" aria-label="Moderation views">
        {forumModerationTabs.map((tab) => (
          <Link
            key={tab}
            className={tab === model.tab ? "page-tab active" : "page-tab"}
            href={`${adminForumPath}?tab=${tab}`}
            aria-current={tab === model.tab ? "page" : undefined}
          >
            {forumModerationTabLabels[tab]}
            {tab === "reports" ? <span className="page-tab-count">{model.pendingCount}</span> : null}
          </Link>
        ))}
      </nav>

      <form className="admin-toolbar" action={adminForumPath} method="get">
        <input type="hidden" name="tab" value={model.tab} />
        <label className="visually-hidden" htmlFor="forum-status">Status</label>
        <select id="forum-status" name="status" defaultValue={filters.status}>
          {statuses.map((status) => (
            <option key={status} value={status}>{statusFilterLabels[status]}</option>
          ))}
        </select>
        {model.tab !== "reports" ? (
          <>
            <label className="visually-hidden" htmlFor="forum-search">Search</label>
            <input
              id="forum-search"
              name="q"
              type="search"
              defaultValue={filters.search}
              placeholder={model.tab === "threads" ? "Search titles and posts" : "Search comments"}
            />
          </>
        ) : null}
        <button className="button button-dark" type="submit">Apply</button>
      </form>

      {model.tab === "reports" ? (
        model.reports.length > 0 ? (
          <ul className="lib-review-list">
            {model.reports.map((report) => (
              <li className="lib-review-card" key={report.id}>
                <div className="lib-card-top">
                  <span className="document-type" aria-hidden="true">
                    {report.targetKind === "thread" ? "POST" : "REPLY"}
                  </span>
                  <div className="lib-card-title">
                    <strong>
                      {report.targetKind === "thread" ? report.threadTitle : `Comment on “${report.threadTitle}”`}
                    </strong>
                    <small>
                      By {report.targetAuthorName} · reported by {report.reporterName} ·{" "}
                      {formatAdminDateTime(report.createdAt)}
                    </small>
                  </div>
                  <span className={`status-chip ${report.status === "pending" ? "processing" : "ready"}`}>
                    {reportStatusLabels[report.status] ?? report.status}
                  </span>
                </div>
                <p className="admin-report-reason"><strong>Reason:</strong> {report.reason}</p>
                <blockquote className="admin-quoted-post">{excerpt(report.targetContent, 400)}</blockquote>
                <p className="lib-review-meta">
                  Post is currently <StatusChip status={report.targetStatus} />
                </p>
                {report.status === "pending" ? (
                  <ForumModerationActions
                    kind={report.targetKind}
                    id={report.targetId}
                    status={report.targetStatus}
                    moderateAction={moderateAction}
                    reportId={report.id}
                    dismissAction={dismissAction}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            message={
              filters.status === "pending"
                ? "No reports are waiting. Students can report posts from the forum."
                : "No reports match this filter."
            }
          />
        )
      ) : model.tab === "threads" ? (
        model.threads.length > 0 ? (
          <ul className="lib-review-list">
            {model.threads.map((thread) => (
              <li className="lib-review-card" key={thread.id}>
                <div className="lib-card-top">
                  <span className="document-type" aria-hidden="true">POST</span>
                  <div className="lib-card-title">
                    <strong>{thread.title}</strong>
                    <small>
                      By {thread.authorName} · {formatAdminDateTime(thread.createdAt)} ·{" "}
                      {thread.commentCount} comments · {thread.upvoteCount} upvotes
                      {thread.pendingReportCount > 0 ? ` · ${thread.pendingReportCount} pending reports` : ""}
                    </small>
                  </div>
                  <StatusChip status={thread.status} />
                </div>
                <p className="lib-card-description">{excerpt(thread.content)}</p>
                <ForumModerationActions
                  kind="thread"
                  id={thread.id}
                  status={thread.status}
                  moderateAction={moderateAction}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState message="No threads match this filter." />
        )
      ) : model.comments.length > 0 ? (
        <ul className="lib-review-list">
          {model.comments.map((comment) => (
            <li className="lib-review-card" key={comment.id}>
              <div className="lib-card-top">
                <span className="document-type" aria-hidden="true">REPLY</span>
                <div className="lib-card-title">
                  <strong>On “{comment.threadTitle}”</strong>
                  <small>
                    By {comment.authorName} · {formatAdminDateTime(comment.createdAt)}
                    {comment.pendingReportCount > 0 ? ` · ${comment.pendingReportCount} pending reports` : ""}
                  </small>
                </div>
                <StatusChip status={comment.status} />
              </div>
              <p className="lib-card-description">{excerpt(comment.content)}</p>
              <ForumModerationActions
                kind="comment"
                id={comment.id}
                status={comment.status}
                moderateAction={moderateAction}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState message="No comments match this filter." />
      )}
    </>
  );
}

function EmptyState({ message }: { readonly message: string }) {
  return (
    <section className="admin-empty">
      <span className="admin-module-icon" aria-hidden="true">✎</span>
      <h2>Nothing here</h2>
      <p>{message}</p>
    </section>
  );
}
