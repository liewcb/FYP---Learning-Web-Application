import Link from "next/link";
import type { ReactNode } from "react";

import { adminBasePath, adminNavigation } from "@/models/admin/admin.model";
import type { Viewer } from "@/models/profile/profile.model";
import { AdminSidebar } from "@/views/admin/admin-sidebar.view";

interface AdminShellProps {
  readonly viewer: Viewer;
  readonly signOutAction: () => Promise<void>;
  readonly children: ReactNode;
}

export function AdminShell({ viewer, signOutAction, children }: AdminShellProps) {
  return (
    <div className="admin-app">
      <div className="admin-main">
        <header className="admin-topbar">
          <Link className="brand" href={adminBasePath}>
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            <span>LearnTogether</span>
            <span className="admin-badge">Admin</span>
          </Link>
        </header>
        <main className="admin-content">{children}</main>
      </div>

      <AdminSidebar
        viewer={viewer}
        navigation={adminNavigation}
        signOutAction={signOutAction}
      />
    </div>
  );
}
