import Link from "next/link";

import type { NavigationItem } from "@/models/home/home.model";
import { myReportsPath } from "@/models/reports/report.model";
import { BrandLogo } from "@/views/shared/brand-logo.view";
import { ChatUnreadBadge } from "@/views/shared/chat-unread-badge.view";
import { NotificationBell } from "@/views/shared/notification-bell.view";
import { ThemeToggle } from "@/views/shared/theme-toggle.view";

interface StudentTopbarProps {
  readonly navigation: readonly NavigationItem[];
  readonly displayName: string;
  readonly initials: string;
  readonly signOutAction: () => Promise<void>;
}

export function StudentTopbar({
  navigation,
  displayName,
  initials,
  signOutAction,
}: StudentTopbarProps) {
  // Colours come from the light/dark theme; see .topbar in globals.css.
  return (
    <header className="topbar">
      <div className="app-shell topbar-inner">
        <Link className="brand-link" href="/" aria-label="Athenix dashboard">
          <BrandLogo />
        </Link>

        <nav className="main-nav" aria-label="Main">
          {navigation.map((item) => (
            <Link
              className={item.active ? "nav-link active" : "nav-link"}
              href={item.href}
              key={item.label}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
              {item.href === "/chats" ? <ChatUnreadBadge /> : null}
            </Link>
          ))}
        </nav>

        <form className="topbar-search" role="search" action="/search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            name="q"
            placeholder="Search notes, peers..."
            aria-label="Search notes and peers"
          />
        </form>

        <div className="account-actions">
          <NotificationBell />

          <details className="account-menu">
            <summary
              className="student-avatar"
              aria-label={`Account menu for ${displayName}`}
              title={displayName}
            >
              {initials}
            </summary>
            <div className="account-menu-panel">
              <p className="account-menu-name">{displayName}</p>
              <Link className="account-menu-item" href="/profile">
                My profile
              </Link>
              <Link className="account-menu-item" href={myReportsPath}>
                My reports
              </Link>
              <form action={signOutAction}>
                <button className="account-menu-item" type="submit">
                  Log out
                </button>
              </form>
            </div>
          </details>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
