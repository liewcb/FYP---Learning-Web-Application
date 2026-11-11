import Link from "next/link";

import {
  auditAreaLabels,
  auditAreas,
  auditEventReason,
  auditLogHref,
  describeAuditEvent,
  type AuditLogModel,
} from "@/models/admin/audit-log.model";
import { AdminPagination } from "@/views/admin/admin-pagination.view";
import { formatAdminDateTime } from "@/views/admin/admin-display";

const areaIcons: Record<string, string> = {
  user: "◎",
  forum_thread: "✎",
  forum_comment: "✎",
  forum_report: "⚑",
  library_material: "▤",
};

export function AdminAuditLogView({ model }: { readonly model: AuditLogModel }) {
  const { filters } = model;

  return (
    <>
      <section className="admin-heading">
        <p className="section-kicker">Administration</p>
        <h1>Audit log</h1>
        <p>
          A permanent, read-only history of administrative and moderation
          actions: who did what, when and why.
        </p>
      </section>

      <nav className="page-tabs" aria-label="Audit log areas">
        {auditAreas.map((area) => (
          <Link
            key={area}
            className={area === filters.area ? "page-tab active" : "page-tab"}
            href={auditLogHref({ area, page: 1 })}
            aria-current={area === filters.area ? "page" : undefined}
          >
            {auditAreaLabels[area]}
          </Link>
        ))}
      </nav>

      <p className="admin-result-count">
        {model.total.toLocaleString("en-MY")} {model.total === 1 ? "event" : "events"}
      </p>

      {model.events.length > 0 ? (
        <ol className="admin-audit-list">
          {model.events.map((event) => {
            const reason = auditEventReason(event);

            return (
              <li key={event.id}>
                <span className="admin-audit-icon" aria-hidden="true">
                  {areaIcons[event.entityType] ?? "•"}
                </span>
                <div>
                  <p className="admin-audit-summary">{describeAuditEvent(event)}</p>
                  {reason ? <p className="admin-audit-reason">“{reason}”</p> : null}
                  <p className="admin-audit-meta">
                    {event.actorName} · {formatAdminDateTime(event.createdAt)} ·{" "}
                    <code>{event.action}</code>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <section className="admin-empty">
          <span className="admin-module-icon" aria-hidden="true">☰</span>
          <h2>No activity yet</h2>
          <p>Administrative actions will be recorded here.</p>
        </section>
      )}

      <AdminPagination
        page={filters.page}
        pageCount={model.pageCount}
        hrefFor={(page) => auditLogHref(filters, page)}
      />
    </>
  );
}
