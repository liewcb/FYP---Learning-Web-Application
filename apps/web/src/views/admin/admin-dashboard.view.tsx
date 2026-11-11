import Link from "next/link";

import { adminBasePath, type AdminDashboardModel } from "@/models/admin/admin.model";
import { MonitoringAlerts } from "@/views/admin/admin-monitoring.view";

interface AdminDashboardViewProps {
  readonly model: AdminDashboardModel;
}

export function AdminDashboardView({ model }: AdminDashboardViewProps) {
  return (
    <>
      <section className="admin-heading">
        <p className="section-kicker">Administration</p>
        <h1>Welcome, {model.viewer.displayName}.</h1>
        <p>
          Manage users, moderate content and keep the platform running
          smoothly.
        </p>
      </section>

      {model.loadError ? (
        <p className="form-alert" role="alert">{model.loadError}</p>
      ) : null}

      <MonitoringAlerts alerts={model.alerts} />

      <section className="admin-stats" aria-label="Platform overview">
        {model.stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <p>{stat.label}</p>
            <strong>{stat.value}</strong>
            <span>{stat.detail}</span>
          </article>
        ))}
      </section>

      <section aria-labelledby="admin-modules-title">
        <h2 className="admin-section-title" id="admin-modules-title">
          Modules
        </h2>
        <div className="admin-module-grid">
          {model.sections.map((section) => (
            <Link
              className="admin-module-card"
              href={`${adminBasePath}/${section.slug}`}
              key={section.slug}
            >
              <span className="admin-module-icon" aria-hidden="true">
                {section.icon}
              </span>
              <strong>{section.label}</strong>
              <span>{section.description}</span>
              {section.ready ? null : <span className="coming-soon">Coming soon</span>}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
