import Link from "next/link";

import {
  bucketLabels,
  formatStorage,
  percentOf,
} from "@/models/admin/system-monitoring.model";
import {
  adminReportsPath,
  reportActionLabels,
  reportGeneratedNotice,
  reportPeriods,
  reportQuery,
  reportSectionDescriptions,
  reportSectionLabels,
  reportSections,
  type ReportRequest,
  type SystemReport,
} from "@/models/admin/system-report.model";
import { formatAdminDate, formatAdminDateTime } from "@/views/admin/admin-display";
import { PrintReportButton } from "@/views/admin/print-report-button.view";

interface AdminReportsViewProps {
  readonly request: ReportRequest;
  readonly report: SystemReport | null;
}

const stateLabels = { operational: "Operational", degraded: "Degraded", down: "Down" } as const;
const dayFormatter = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short" });

function Figure({ label, value }: { readonly label: string; readonly value: string | number | null }) {
  return (
    <div className="admin-figure">
      <span>{label}</span>
      <strong>{value === null ? "—" : typeof value === "number" ? value.toLocaleString("en-MY") : value}</strong>
    </div>
  );
}

export function AdminReportsView({ request, report }: AdminReportsViewProps) {
  return (
    <>
      <section className="admin-heading report-no-print">
        <p className="section-kicker">Administration</p>
        <h1>System reports</h1>
        <p>
          Choose what to include and the period to cover. Reports use live data
          every time and can be downloaded as CSV or saved as PDF.
        </p>
      </section>

      <form className="admin-panel report-form report-no-print" action={adminReportsPath} method="get">
        <input type="hidden" name="generate" value="1" />
        <fieldset>
          <legend>Report information</legend>
          <div className="report-options">
            {reportSections.map((section) => (
              <label key={section}>
                <input
                  type="checkbox"
                  name="sections"
                  value={section}
                  defaultChecked={request.sections.includes(section)}
                />
                <span>
                  <strong>{reportSectionLabels[section]}</strong>
                  <small>{reportSectionDescriptions[section]}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Period</legend>
          <div className="storage-amounts">
            {reportPeriods.map((days) => (
              <label key={days}>
                <input type="radio" name="days" value={days} defaultChecked={request.days === days} />
                <span>Last {days} days</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="button button-dark" type="submit">Generate report</button>
      </form>

      {report ? <ReportBody report={report} /> : null}
    </>
  );
}

function ReportBody({ report }: { readonly report: SystemReport }) {
  const { request, monitoring, activity } = report;
  const overview = monitoring.overview;
  const has = (section: (typeof reportSections)[number]) => request.sections.includes(section);
  const maxDaily = Math.max(
    1,
    ...activity.daily.map((day) => day.uploads + day.quizAttempts + day.forumPosts + day.newUsers),
  );

  return (
    <article className="system-report" aria-labelledby="report-title">
      <p className="saved-result-note report-no-print" role="status">{reportGeneratedNotice}.</p>

      <header className="system-report-header">
        <div>
          <p className="section-kicker">Athenix system report</p>
          <h2 id="report-title">Last {activity.days} days</h2>
          <p>
            {formatAdminDate(activity.from)} to {formatAdminDate(activity.to)} · generated{" "}
            {formatAdminDateTime(report.generatedAt)} by {report.generatedBy}
          </p>
        </div>
        <div className="system-report-actions report-no-print">
          <a className="button button-dark" href={`${adminReportsPath}/download?${reportQuery(request)}`}>
            Download CSV
          </a>
          <PrintReportButton />
        </div>
      </header>

      {has("storage") ? (
        <section className="admin-panel">
          <h2>Storage utilisation</h2>
          <p className="admin-panel-lead">
            {formatStorage(monitoring.platformBytes)} of {formatStorage(monitoring.platformCapacityBytes)} used (
            {percentOf(monitoring.platformBytes, monitoring.platformCapacityBytes)}%) ·{" "}
            {formatStorage(activity.learning.bytesUploaded)} uploaded in this period ·{" "}
            {overview.storage.usersOver80Percent} students above 80% of their quota
          </p>
          <div className="report-two-column">
            <table className="admin-table">
              <thead><tr><th scope="col">Area</th><th scope="col">Files</th><th scope="col">Size</th></tr></thead>
              <tbody>
                {(overview.storage.buckets ?? []).map((bucket) => (
                  <tr key={bucket.bucket}>
                    <td>{bucketLabels[bucket.bucket] ?? bucket.bucket}</td>
                    <td>{bucket.objects.toLocaleString("en-MY")}</td>
                    <td>{formatStorage(bucket.bytes)}</td>
                  </tr>
                ))}
                {overview.storage.buckets === null ? (
                  <tr><td colSpan={3}>Storage details unavailable.</td></tr>
                ) : null}
              </tbody>
            </table>
            <table className="admin-table">
              <thead><tr><th scope="col">Student</th><th scope="col">Used</th><th scope="col">Quota</th></tr></thead>
              <tbody>
                {monitoring.heaviestUsers.length > 0 ? monitoring.heaviestUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{formatStorage(user.usedBytes)}</td>
                    <td>{formatStorage(user.quotaBytes)}</td>
                  </tr>
                )) : <tr><td colSpan={3}>No uploads yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {has("activity") ? (
        <section className="admin-panel">
          <h2>User activities</h2>
          <div className="admin-figures compact">
            <Figure label="Registered users" value={activity.users.total} />
            <Figure label="New users" value={activity.users.new} />
            <Figure label="Active users" value={activity.users.active} />
            <Figure label="Documents uploaded" value={activity.learning.documentsUploaded} />
            <Figure label="Content analyses" value={activity.learning.analysesReady} />
            <Figure label="Quizzes generated" value={activity.learning.quizzesReady} />
            <Figure label="Quiz attempts" value={activity.learning.quizAttempts} />
            <Figure
              label="Average quiz score"
              value={activity.learning.averageScore === null ? null : `${activity.learning.averageScore}%`}
            />
            <Figure label="Forum threads" value={activity.learning.forumThreads} />
            <Figure label="Forum comments" value={activity.learning.forumComments} />
            <Figure label="Library submissions" value={activity.learning.librarySubmissions} />
            <Figure label="Library published" value={activity.learning.libraryPublished} />
          </div>

          <h3 className="report-subtitle">Activity per day</h3>
          <ol className="report-daily" aria-label="Activity per day">
            {activity.daily.map((day) => {
              const total = day.uploads + day.quizAttempts + day.forumPosts + day.newUsers;

              return (
                <li key={day.day} title={`${day.uploads} uploads, ${day.quizAttempts} quiz attempts, ${day.forumPosts} forum posts, ${day.newUsers} new users`}>
                  <span className="report-daily-bar" style={{ height: `${Math.round((total / maxDaily) * 100)}%` }} />
                  <span className="visually-hidden">
                    {dayFormatter.format(new Date(day.day))}: {day.uploads} uploads, {day.quizAttempts} quiz attempts,{" "}
                    {day.forumPosts} forum posts, {day.newUsers} new users
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="admin-panel-note">
            Uploads, quiz attempts, forum posts and new users combined, from{" "}
            {activity.daily[0] ? dayFormatter.format(new Date(activity.daily[0].day)) : ""} to today.
          </p>

          <h3 className="report-subtitle">Most active students</h3>
          {activity.topStudents.length > 0 ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Student</th><th scope="col">Uploads</th><th scope="col">Quiz attempts</th>
                  <th scope="col">Forum posts</th><th scope="col">Library</th>
                </tr>
              </thead>
              <tbody>
                {activity.topStudents.map((student) => (
                  <tr key={`${student.name}-${student.username ?? ""}`}>
                    <td>{student.name}{student.username ? ` (@${student.username})` : ""}</td>
                    <td>{student.uploads}</td>
                    <td>{student.quizAttempts}</td>
                    <td>{student.forumPosts}</td>
                    <td>{student.librarySubmissions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="admin-panel-note">No student activity in this period.</p>
          )}
        </section>
      ) : null}

      {has("sessions") ? (
        <section className="admin-panel">
          <h2>Active user sessions</h2>
          <div className="admin-figures compact">
            <Figure label="Online now" value={overview.users.seenLast15Minutes} />
            <Figure label="Active today" value={overview.users.seenLast24Hours} />
            <Figure label="Active sessions" value={overview.sessions?.active ?? null} />
            <Figure label="Users signed in" value={overview.sessions?.usersWithSessions ?? null} />
            <Figure label="Sessions started in period" value={activity.sessionsStarted} />
            <Figure label="Signed in during period" value={activity.users.signedIn} />
          </div>
          {overview.sessions === null ? (
            <p className="admin-panel-note">Session data could not be read from the database.</p>
          ) : null}
        </section>
      ) : null}

      {has("status") ? (
        <section className="admin-panel">
          <h2>System status</h2>
          <table className="admin-table">
            <thead><tr><th scope="col">Service</th><th scope="col">State</th><th scope="col">Detail</th></tr></thead>
            <tbody>
              {monitoring.services.map((service) => (
                <tr key={service.name}>
                  <td>{service.name}</td>
                  <td className={`report-state ${service.state}`}>{stateLabels[service.state]}</td>
                  <td>{service.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="admin-figures compact">
            <Figure label="Failed extractions" value={activity.learning.documentsFailed} />
            <Figure label="Failed analyses" value={activity.learning.analysesFailed} />
            <Figure label="Failed quiz generations" value={activity.learning.quizzesFailed} />
            <Figure label="Open alerts" value={monitoring.alerts.length} />
          </div>
          {monitoring.alerts.length > 0 ? (
            <ul className="report-alerts">
              {monitoring.alerts.map((alert) => (
                <li key={alert.title}><strong>{alert.title}.</strong> {alert.detail}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {has("administration") ? (
        <section className="admin-panel">
          <h2>Moderation &amp; administration</h2>
          <div className="admin-figures compact">
            <Figure label="Storage requests" value={activity.administration.storageRequests.submitted} />
            <Figure label="Approved / rejected" value={`${activity.administration.storageRequests.approved} / ${activity.administration.storageRequests.rejected}`} />
            <Figure label="Storage granted" value={formatStorage(activity.administration.storageRequests.bytesGranted)} />
            {activity.administration.reports ? (
              <Figure label="Reports resolved" value={`${activity.administration.reports.resolved} of ${activity.administration.reports.submitted}`} />
            ) : null}
          </div>
          {Object.keys(activity.administration.actions).length > 0 ? (
            <table className="admin-table">
              <thead><tr><th scope="col">Action</th><th scope="col">Count</th></tr></thead>
              <tbody>
                {Object.entries(activity.administration.actions)
                  .sort((a, b) => b[1] - a[1])
                  .map(([action, total]) => (
                    <tr key={action}>
                      <td>{reportActionLabels[action] ?? action.replace(/_/g, " ")}</td>
                      <td>{total}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <p className="admin-panel-note">No administrative actions in this period.</p>
          )}
          <Link className="text-action report-no-print" href="/admin/audit-log">Open the audit log →</Link>
        </section>
      ) : null}
    </article>
  );
}
