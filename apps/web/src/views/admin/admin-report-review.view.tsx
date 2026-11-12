import Link from "next/link";

import {
  adminReportReviewPath,
  reportPersonLabel,
  reportReasonLabel,
  reportReviewHref,
  reportReviewStatusLabels,
  reportReviewStatuses,
  reportStatusLabels,
  reportTargetCodes,
  reportTargetLabels,
  reportTargetTypes,
  resolutionSummaries,
  type AdminReportDetail,
  type ReportContextMessage,
  type ReportEvidence,
  type ReportReviewModel,
  type ReportStatus,
} from "@/models/reports/report.model";
import { AdminPagination } from "@/views/admin/admin-pagination.view";
import { excerpt, formatAdminDateTime } from "@/views/admin/admin-display";
import {
  ReportDecisionForm,
  type ReportDecisionAction,
} from "@/views/admin/report-decision-form.view";
import { ReportReviewDialog } from "@/views/admin/report-review-dialog.view";

interface AdminReportReviewViewProps {
  readonly model: ReportReviewModel;
  readonly decideAction: ReportDecisionAction;
}

const statusChip: Record<ReportStatus, string> = {
  pending: "processing",
  actioned: "failed",
  dismissed: "ready",
};

/** Words for where the reported thing stands now. */
const currentStateLabels: Record<string, string> = {
  active: "Account active",
  suspended: "Account suspended",
  visible: "Still visible in the chat",
  removed: "Removed",
  published: "Published",
  hidden: "Hidden by a moderator",
  deleted: "Removed",
  archived: "Archived",
  pending_review: "Waiting for library review",
  rejected: "Rejected",
  draft: "Draft",
};

function ContextMessages({ messages }: { readonly messages: readonly ReportContextMessage[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <ol className="report-context" aria-label="Earlier messages">
      {messages.map((message, index) => (
        <li key={`${message.sentAt}-${index}`}>
          <strong>{message.senderName}</strong>{" "}
          <time dateTime={message.sentAt}>{formatAdminDateTime(message.sentAt)}</time>
          <p className={message.deleted ? "report-context-deleted" : undefined}>
            {message.deleted ? "Deleted message" : message.body || message.attachmentName || "Attachment"}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Evidence({ evidence }: { readonly evidence: ReportEvidence }) {
  switch (evidence.kind) {
    case "user":
      return (
        <>
          <dl className="report-facts">
            <div><dt>Name</dt><dd>{evidence.fullName}{evidence.username ? ` (@${evidence.username})` : ""}</dd></div>
            <div><dt>Course</dt><dd>{[evidence.academicMajor, evidence.yearOfStudy ? `Year ${evidence.yearOfStudy}` : null].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt>Interests</dt><dd>{evidence.interests.join(", ") || "—"}</dd></div>
          </dl>
          <blockquote className="admin-quoted-post">{evidence.bio || "No bio."}</blockquote>
          {evidence.context.length > 0 ? (
            <>
              <h4>Recent messages in their chat with the reporter</h4>
              <ContextMessages messages={evidence.context} />
            </>
          ) : null}
        </>
      );
    case "chat_message":
      return (
        <>
          <p className="lib-review-meta">
            {evidence.chatLabel}
            {evidence.sentAt ? ` · sent ${formatAdminDateTime(evidence.sentAt)}` : ""}
          </p>
          {evidence.context.length > 0 ? (
            <>
              <h4>Messages before it</h4>
              <ContextMessages messages={evidence.context} />
            </>
          ) : null}
          <h4>Reported message</h4>
          <blockquote className="admin-quoted-post">
            {evidence.body || (evidence.attachmentName ? `Attachment: ${evidence.attachmentName}` : "No text")}
          </blockquote>
        </>
      );
    case "forum_thread":
      return (
        <>
          <h4>{evidence.title}</h4>
          <blockquote className="admin-quoted-post">{excerpt(evidence.content, 1200)}</blockquote>
        </>
      );
    case "forum_comment":
      return (
        <>
          <p className="lib-review-meta">On “{evidence.threadTitle}”</p>
          <blockquote className="admin-quoted-post">{excerpt(evidence.content, 1200)}</blockquote>
        </>
      );
    case "library_material":
      return (
        <>
          <h4>{evidence.title}</h4>
          {evidence.subject ? <p className="lib-review-meta">{evidence.subject}</p> : null}
          <blockquote className="admin-quoted-post">{excerpt(evidence.description, 1200) || "No description."}</blockquote>
        </>
      );
  }
}

function ReportDetail({
  report,
  model,
  decideAction,
}: {
  readonly report: AdminReportDetail;
  readonly model: ReportReviewModel;
  readonly decideAction: ReportDecisionAction;
}) {
  const openOthers = report.otherReports.filter((other) => other.status === "pending").length;

  return (
    <div className="report-detail">
      <header className="report-detail-top">
        <p className="section-kicker">{reportTargetLabels[report.targetType]} · report #{report.id}</p>
        <h2 id="report-detail-title">{report.targetLabel}</h2>
      </header>

      <dl className="report-facts">
        <div><dt>Reason</dt><dd>{reportReasonLabel(report.reason)}</dd></div>
        <div>
          <dt>Reported by</dt>
          <dd>
            {report.reporter ? reportPersonLabel(report.reporter) : "A deleted account"} ·{" "}
            {formatAdminDateTime(report.createdAt)}
          </dd>
        </div>
        <div>
          <dt>{report.targetType === "user" ? "Student" : "Author"}</dt>
          <dd>
            {report.reportedUser
              ? `${reportPersonLabel(report.reportedUser)} · ${report.reportedUser.accountStatus === "suspended" ? "suspended" : "active"}`
              : "A deleted account"}
          </dd>
        </div>
        <div>
          <dt>Now</dt>
          <dd>{report.current.exists ? currentStateLabels[report.current.state ?? ""] ?? report.current.state : "Deleted"}</dd>
        </div>
      </dl>

      {report.details ? <p className="admin-report-reason"><strong>Reporter’s words:</strong> {report.details}</p> : null}

      <div className="report-evidence">
        <h3>What was reported</h3>
        <p className="report-evidence-note">As it was when the report was sent.</p>
        <Evidence evidence={report.evidence} />
      </div>

      {report.otherReports.length > 0 ? (
        <div className="report-others">
          <h3>Other reports about this ({report.otherReports.length})</h3>
          <ul>
            {report.otherReports.map((other) => (
              <li key={other.id}>
                <span className={`status-chip ${statusChip[other.status]}`}>{reportStatusLabels[other.status]}</span>{" "}
                {reportReasonLabel(other.reason)} · {other.reporterName} · {formatAdminDateTime(other.createdAt)}
                {other.details ? <p>“{other.details}”</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.status === "pending" ? (
        <ReportDecisionForm
          key={report.id}
          reportId={report.id}
          decisions={model.decisions}
          reportedName={report.reportedUser?.name ?? null}
          openReports={openOthers + 1}
          action={decideAction}
        />
      ) : (
        <div className="report-decided">
          <h3>Decision</h3>
          <p>
            <span className={`status-chip ${statusChip[report.status]}`}>{reportStatusLabels[report.status]}</span>{" "}
            by {report.reviewerName ?? "an administrator"} · {formatAdminDateTime(report.reviewedAt)}
          </p>
          {report.resolution ? <p>Reporter was told: “{resolutionSummaries[report.resolution]}”</p> : null}
          {report.moderatorMessage ? <p>Message: “{report.moderatorMessage}”</p> : null}
          {report.internalNote ? <p>Reason (internal): {report.internalNote}</p> : null}
          <p>Each reporter was notified.</p>
        </div>
      )}
    </div>
  );
}

export function AdminReportReviewView({ model, decideAction }: AdminReportReviewViewProps) {
  const { filters } = model;

  return (
    <>
      <section className="admin-heading">
        <p className="section-kicker">Administration</p>
        <h1>Report review</h1>
        <p>
          Reports from students about profiles, chat messages, forum posts and library
          materials. A decision closes every open report about the same thing and notifies each
          reporter. Removed content is kept in the report as evidence.
        </p>
      </section>

      <nav className="page-tabs" aria-label="Report status">
        {reportReviewStatuses.map((status) => (
          <Link
            key={status}
            className={status === filters.status ? "page-tab active" : "page-tab"}
            href={reportReviewHref(filters, { status, page: 1, reportId: null })}
            aria-current={status === filters.status ? "page" : undefined}
          >
            {reportReviewStatusLabels[status]}
            {status === "pending" ? <span className="page-tab-count">{model.openCount}</span> : null}
          </Link>
        ))}
      </nav>

      <form className="admin-toolbar" action={adminReportReviewPath} method="get">
        {filters.status !== "pending" ? <input type="hidden" name="status" value={filters.status} /> : null}
        <label className="visually-hidden" htmlFor="report-type">What was reported</label>
        <select id="report-type" name="type" defaultValue={filters.targetType}>
          <option value="all">Everything</option>
          {reportTargetTypes.map((type) => (
            <option key={type} value={type}>{reportTargetLabels[type]}</option>
          ))}
        </select>
        <button className="button button-dark" type="submit">Apply</button>
      </form>

      <div className="report-review-queue">
        {model.reports.length > 0 ? (
          <ul className="lib-review-list">
            {model.reports.map((report) => (
              <li
                className={report.id === filters.reportId ? "lib-review-card report-card selected" : "lib-review-card report-card"}
                key={report.id}
              >
                <div className="lib-card-top">
                  <span className="document-type" title={reportTargetLabels[report.targetType]} aria-hidden="true">
                    {reportTargetCodes[report.targetType]}
                  </span>
                  <div className="lib-card-title">
                    <strong>{report.targetLabel}</strong>
                    <small>
                      {reportReasonLabel(report.reason)} · by {report.reporterName} · {formatAdminDateTime(report.createdAt)}
                      {report.status === "pending" && report.openReportsOnTarget > 1
                        ? ` · ${report.openReportsOnTarget} open reports`
                        : ""}
                    </small>
                  </div>
                  <span className={`status-chip ${statusChip[report.status]}`}>
                    {reportStatusLabels[report.status]}
                  </span>
                </div>
                {report.details ? <p className="admin-report-reason">“{excerpt(report.details, 160)}”</p> : null}
                <Link
                  className="button button-outline report-open"
                  href={reportReviewHref(filters, { reportId: report.id })}
                  scroll={false}
                >
                  {report.status === "pending" ? "Review" : "View decision"}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="admin-empty">
            <p>
              {filters.status === "pending"
                ? "No reports are waiting. Students can report profiles, messages, posts and materials."
                : "No reports match this filter."}
            </p>
          </div>
        )}

        <AdminPagination
          page={filters.page}
          pageCount={model.pageCount}
          hrefFor={(page) => reportReviewHref(filters, { page, reportId: null })}
        />
      </div>

      {filters.reportId !== null ? (
        // Keyed by report, so switching reports opens a fresh window.
        <ReportReviewDialog
          key={filters.reportId}
          closeHref={reportReviewHref(filters, { reportId: null })}
          labelledBy="report-detail-title"
        >
          {model.selected ? (
            <ReportDetail report={model.selected} model={model} decideAction={decideAction} />
          ) : (
            <div className="report-detail">
              <h2 id="report-detail-title">Report not found</h2>
              <p>It may have been deleted with the account that sent it.</p>
            </div>
          )}
        </ReportReviewDialog>
      ) : null}
    </>
  );
}
