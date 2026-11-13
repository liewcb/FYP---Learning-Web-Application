import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import {
  reportReasonLabel,
  reportStatusLabels,
  reportTargetLabels,
  resolutionSummaries,
  type MyReport,
} from "@/models/reports/report.model";
import { StudentTopbar } from "@/views/student/student-topbar.view";

const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

interface MyReportsPageViewProps {
  readonly viewer: Viewer;
  readonly reports: readonly MyReport[];
  readonly loadError: string | null;
  readonly signOutAction: () => Promise<void>;
}

/** The student's reports and what moderators decided. */
export function MyReportsPageView({ viewer, reports, loadError, signOutAction }: MyReportsPageViewProps) {
  const open = reports.filter((report) => report.status === "pending").length;

  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation()}
        displayName={viewer.displayName}
        initials={viewer.initials}
        avatarUrl={viewer.avatarUrl}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content my-reports">
        <header className="my-reports-header">
          <h1>My reports</h1>
          <p>
            Reports you sent and what moderators decided.
            {open > 0 ? ` ${open} under review.` : ""}
          </p>
        </header>

        {loadError ? (
          <p className="field-error" role="alert">
            {loadError}
          </p>
        ) : reports.length === 0 ? (
          <section className="module-card my-reports-empty">
            <h2>No reports yet</h2>
            <p>
              See something that breaks the rules? Use Report on it.
            </p>
          </section>
        ) : (
          <ol className="my-reports-list">
            {reports.map((report) => (
              <li key={report.id} className="module-card my-report">
                <div className="my-report-top">
                  <div>
                    <p className="my-report-type">{reportTargetLabels[report.targetType]}</p>
                    <h2>{report.targetLabel}</h2>
                  </div>
                  <span className={`status-chip report-${report.status}`}>
                    {reportStatusLabels[report.status]}
                  </span>
                </div>

                <dl className="my-report-facts">
                  <div>
                    <dt>Reason</dt>
                    <dd>{reportReasonLabel(report.reason)}</dd>
                  </div>
                  <div>
                    <dt>Sent</dt>
                    <dd>
                      <time dateTime={report.createdAt}>{dateFormatter.format(new Date(report.createdAt))}</time>
                    </dd>
                  </div>
                  {report.reviewedAt ? (
                    <div>
                      <dt>Decided</dt>
                      <dd>
                        <time dateTime={report.reviewedAt}>{dateFormatter.format(new Date(report.reviewedAt))}</time>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {report.details ? <p className="my-report-details">“{report.details}”</p> : null}

                {report.resolution ? (
                  <div className="my-report-outcome">
                    <p>{resolutionSummaries[report.resolution]}</p>
                    {report.moderatorMessage ? (
                      <p>
                        <strong>Moderator:</strong> {report.moderatorMessage}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
