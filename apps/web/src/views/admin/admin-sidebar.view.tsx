"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { adminBasePath, type AdminNavItem } from "@/models/admin/admin.model";
import type { Viewer } from "@/models/profile/profile.model";
import { Avatar } from "@/views/shared/avatar.view";

interface AdminSidebarProps {
  readonly viewer: Viewer;
  readonly navigation: readonly AdminNavItem[];
  readonly signOutAction: () => Promise<void>;
}

function isActive(pathname: string, href: string): boolean {
  return href === adminBasePath
    ? pathname === adminBasePath
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({
  viewer,
  navigation,
  signOutAction,
}: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar" aria-label="Admin navigation">
      <div className="admin-identity">
        <Avatar className="student-avatar" initials={viewer.initials} url={viewer.avatarUrl} />
        <div>
          <strong>{viewer.displayName}</strong>
          <span>Administrator</span>
        </div>
      </div>

      <nav className="admin-nav">
        {navigation.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              className={active ? "admin-nav-link active" : "admin-nav-link"}
              href={item.href}
              key={item.href}
              aria-current={active ? "page" : undefined}
            >
              <span className="admin-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <form className="admin-signout" action={signOutAction}>
        <button className="admin-nav-link" type="submit">
          <span className="admin-nav-icon" aria-hidden="true">
            ⇥
          </span>
          Log out
        </button>
      </form>
    </aside>
  );
}
