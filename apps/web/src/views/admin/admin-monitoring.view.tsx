import Link from "next/link";

import {
  adminMonitoringPath,
  bucketLabels,
  formatStorage,
  percentOf,
  platformStorageCriticalRatio,
  platformStorageWarningRatio,
  userStorageWarningRatio,
  type MonitoringAlert,
  type MonitoringModel,
} from "@/models/admin/system-monitoring.model";
import { formatAdminDateTime } from "@/views/admin/admin-display";

const stateLabels = { operational: "Operational", degraded: "Degraded", down: "Down" } as const;

const activitySeries = [
  { key: "uploads", label: "Uploads" },
  { key: "quizAttempts", label: "Quiz attempts" },
  { key: "forumPosts", label: "Forum posts" },
  { key: "newUsers", label: "New users" },
] as const;

const dayFormatter = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short" });

export function MonitoringAlerts({ alerts }: { readonly alerts: readonly MonitoringAlert[] }) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <section className="admin-alerts" aria-label="Alerts">
      {alerts.map((alert) => (
        <div className={`admin-alert ${alert.level}`} key={alert.title} role="status">
          <span aria-hidden="true">{alert.level === "critical" ? "!" : "▲"}</span>
          <div>
            <strong>{alert.title}</strong>
            <p>{alert.detail}</p>
          </div>
          {alert.href ? <Link href={alert.href}>Review →</Link> : null}
        </div>
      ))}
    </section>
  );
}

function Figure({ label, value, detail }: { readonly label: string; readonly value: string | number; readonly detail?: string }) {
  return (
    <div className="admin-figure">
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString("en-MY") : value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function AdminMonitoringView({ model }: { readonly model: MonitoringModel }) {
  const { overview } = model;
  const platformPercent = percentOf(model.platformBytes, model.platformCapacityBytes);
  const platformTone =
    platformPercent >= platformStorageCriticalRatio * 100
      ? " is-critical"
      : platformPercent >= platformStorageWarningRatio * 100
        ? " is-warning"
        : "";

  return (
    <>
      <section className="admin-heading admin-heading-row">
        <div>
          <p className="section-kicker">Administration</p>
          <h1>System monitoring</h1>
          <p>
            Live health of the platform&apos;s services, storage use and activity.
            Figures were collected at {formatAdminDateTime(overview.generatedAt)}.
          </p>
        </div>
        <Link className="button button-outline" href={adminMonitoringPath} prefetch={false}>
          Refresh
        </Link>
      </section>

      <MonitoringAlerts alerts={model.alerts} />

      <section aria-labelledby="services-title">
        <h2 className="admin-section-title" id="services-title">Service status</h2>
        <ul className="admin-service-grid">
          {model.services.map((service) => (
            <li className={`admin-service ${service.state}`} key={service.name}>
              <span className="admin-service-dot" aria-hidden="true" />
              <div>
                <strong>{service.name}</strong>
                <span>{stateLabels[service.state]}</span>
                <small>{service.detail}</small>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="admin-monitor-grid">
        <section className="admin-panel" aria-labelledby="storage-title">
          <h2 id="storage-title">Storage utilisation</h2>
          <p className="admin-panel-lead">
            {formatStorage(model.platformBytes)} of {formatStorage(model.platformCapacityBytes)} used
            ({platformPercent}%)
          </p>
          <span
            className={`admin-meter large${platformTone}`}
            role="img"
            aria-label={`${platformPercent} percent of platform storage used`}
          >
            <span style={{ width: `${Math.min(100, platformPercent)}%` }} />
          </span>

          {overview.storage.buckets ? (
            <table className="admin-table">
              <thead>
                <tr><th scope="col">Area</th><th scope="col">Files</th><th scope="col">Size</th></tr>
              </thead>
              <tbody>
                {overview.storage.buckets.length > 0 ? overview.storage.buckets.map((bucket) => (
                  <tr key={bucket.bucket}>
                    <td>{bucketLabels[bucket.bucket] ?? bucket.bucket}</td>
                    <td>{bucket.objects.toLocaleString("en-MY")}</td>
                    <td>{formatStorage(bucket.bytes)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3}>No files stored yet.</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <p className="admin-panel-note">
              File storage details are unavailable, so this uses uploaded document sizes only.
            </p>
          )}
        </section>

        <section className="admin-panel" aria-labelledby="heavy-title">
          <h2 id="heavy-title">Storage by student</h2>
          <p className="admin-panel-lead">
            {overview.storage.usersOver80Percent} {overview.storage.usersOver80Percent === 1 ? "student" : "students"} above{" "}
            {Math.round(userStorageWarningRatio * 100)}% of their quota
          </p>
          {model.heaviestUsers.length > 0 ? (
            <ul className="admin-usage-list">
              {model.heaviestUsers.map((user) => {
                const percent = percentOf(user.usedBytes, user.quotaBytes);
                const warn = percent >= userStorageWarningRatio * 100;

                return (
                  <li key={user.id}>
                    <div>
                      <strong>{user.name}</strong>
                      <span className={warn ? "is-warning" : ""}>
                        {formatStorage(user.usedBytes)} / {formatStorage(user.quotaBytes)} · {percent}%
                      </span>
                    </div>
                    <span className={`admin-meter${warn ? " is-warning" : ""}`} aria-hidden="true">
                      <span style={{ width: `${Math.min(100, percent)}%` }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="admin-panel-note">No student has uploaded files yet.</p>
          )}
          <Link className="text-action" href="/admin/users?sort=storage">
            Manage quotas →
          </Link>
        </section>

        <section className="admin-panel" aria-labelledby="users-title">
          <h2 id="users-title">Users &amp; sessions</h2>
          <div className="admin-figures">
            <Figure label="Online now" value={overview.users.seenLast15Minutes} detail="Active in the last 15 min" />
            <Figure label="Active today" value={overview.users.seenLast24Hours} detail="Last 24 hours" />
            <Figure
              label="Active sessions"
              value={overview.sessions ? overview.sessions.active : "—"}
              detail={
                overview.sessions
                  ? `${overview.sessions.usersWithSessions} users signed in`
                  : "Session data unavailable"
              }
            />
            <Figure label="Students" value={overview.users.students} detail={`${overview.users.newLast7Days} joined this week`} />
            <Figure label="Suspended" value={overview.users.suspended} />
            <Figure label="Admins" value={overview.users.admins} />
          </div>
        </section>

        <section className="admin-panel" aria-labelledby="pipeline-title">
          <h2 id="pipeline-title">Documents &amp; AI pipeline</h2>
          <div className="admin-figures">
            <Figure label="Documents" value={overview.documents.total} detail={`${overview.documents.uploadedLast24Hours} uploaded today`} />
            <Figure label="Processing" value={overview.documents.processing} />
            <Figure label="Failed extraction" value={overview.documents.failed} />
            <Figure
              label="Analyses"
              value={overview.ai.analysesReady}
              detail={`${overview.ai.analysesFailed} failed · ${overview.ai.analysesStuck} stuck`}
            />
            <Figure label="Quizzes" value={overview.ai.quizzesReady} detail={`${overview.ai.quizzesFailed} failed`} />
            <Figure
              label="Quiz attempts"
              value={overview.ai.quizAttempts}
              detail={`${overview.ai.quizAttemptsLast24Hours} today`}
            />
          </div>
        </section>
      </div>

      <section className="admin-panel" aria-labelledby="activity-title">
        <h2 id="activity-title">Activity, last 14 days</h2>
        <div className="admin-activity">
          {activitySeries.map((series) => {
            const values = overview.activity.map((day) => day[series.key]);
            const max = Math.max(1, ...values);
            const total = values.reduce((sum, value) => sum + value, 0);

            return (
              <div className="admin-activity-series" key={series.key}>
                <p>
                  <strong>{series.label}</strong>
                  <span>{total.toLocaleString("en-MY")} total</span>
                </p>
                <ol className="admin-bars" aria-label={`${series.label} per day`}>
                  {overview.activity.map((day) => (
                    <li key={day.day} title={`${dayFormatter.format(new Date(day.day))}: ${day[series.key]}`}>
                      <span style={{ height: `${Math.round((day[series.key] / max) * 100)}%` }} />
                      <span className="visually-hidden">
                        {dayFormatter.format(new Date(day.day))}: {day[series.key]}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
        <div className="admin-figures compact">
          <Figure label="Forum threads" value={overview.community.forumThreads} />
          <Figure label="Forum comments" value={overview.community.forumComments} />
          <Figure label="Pending reports" value={overview.community.pendingForumReports} />
          <Figure label="Library reviews waiting" value={overview.community.pendingLibraryMaterials} />
        </div>
      </section>
    </>
  );
}
