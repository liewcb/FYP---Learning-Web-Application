import Link from "next/link";

import type { NavigationItem } from "@/models/home/home.model";

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
  return (
    <header className="topbar">
      <div className="app-shell topbar-inner">
        <Link className="brand" href="/" aria-label="LearnTogether AI home">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span>LearnTogether</span>
        </Link>

        <nav className="main-nav" aria-label="Student navigation">
          {navigation.map((item) => (
            <a
              className={item.active ? "nav-link active" : "nav-link"}
              href={item.href}
              key={item.label}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="account-actions">
          <button className="icon-button" type="button" aria-label="Notifications">
            <span className="notification-dot" />
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
            </svg>
          </button>
          <Link
            className="student-avatar"
            href="/profile"
            title={`${displayName} – My profile`}
            aria-label="My profile"
          >
            {initials}
          </Link>
          <form action={signOutAction}>
            <button className="quiet-button" type="submit">
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
