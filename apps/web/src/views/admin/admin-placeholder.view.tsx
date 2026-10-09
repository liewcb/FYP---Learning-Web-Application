import Link from "next/link";

import { adminBasePath, type AdminSection } from "@/models/admin/admin.model";

interface AdminPlaceholderViewProps {
  readonly section: AdminSection;
}

export function AdminPlaceholderView({ section }: AdminPlaceholderViewProps) {
  return (
    <>
      <section className="admin-heading">
        <p className="section-kicker">Administration</p>
        <h1>{section.label}</h1>
        <p>{section.description}</p>
      </section>

      <section className="admin-empty">
        <span className="admin-module-icon" aria-hidden="true">
          {section.icon}
        </span>
        <h2>This module isn&apos;t built yet</h2>
        <p>
          The {section.label.toLowerCase()} tools will appear here once the
          module is implemented.
        </p>
        <Link className="quiet-button" href={adminBasePath}>
          ← Back to overview
        </Link>
      </section>
    </>
  );
}
