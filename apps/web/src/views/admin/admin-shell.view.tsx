import Link from "next/link";
import type { ReactNode } from "react";

import { adminBasePath, adminNavigation } from "@/models/admin/admin.model";
import type { Viewer } from "@/models/profile/profile.model";
import { AdminSidebar } from "@/views/admin/admin-sidebar.view";
import { BrandLogo } from "@/views/shared/brand-logo.view";

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
          <Link className="brand-link" href={adminBasePath} aria-label="Athenix admin">
            <BrandLogo tone="navy" />
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
