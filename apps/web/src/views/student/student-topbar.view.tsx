import Link from "next/link";

import type { NavigationItem } from "@/models/home/home.model";
import { BrandLogo } from "@/views/shared/brand-logo.view";

interface StudentTopbarProps {
  readonly navigation: readonly NavigationItem[];
  readonly displayName: string;
  readonly initials: string;
  readonly signOutAction: () => Promise<void>;
  /** Light (default) or the midnight-navy variant from the brand kit. */
  readonly tone?: "light" | "dark";
}

export function StudentTopbar({
  navigation,
  displayName,
  initials,
  signOutAction,
  tone = "light",
}: StudentTopbarProps) {
  return (
    <header className={`topbar topbar-${tone}`}>
      <div className="app-shell topbar-inner">
        <Link className="brand-link" href="/" aria-label="Athenix dashboard">
          <BrandLogo tone={tone === "dark" ? "ivory" : "navy"} />
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
          <button className="icon-button" type="button" aria-label="Notifications">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
            </svg>
            <span className="notification-dot" />
          </button>

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
              <form action={signOutAction}>
                <button className="account-menu-item" type="submit">
                  Log out
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
