"use client";

import {
  oppositeTheme,
  parseTheme,
  themeCookieMaxAgeSeconds,
  themeCookieName,
  type Theme,
} from "@/models/preferences/theme.model";

function currentTheme(): Theme {
  const saved = parseTheme(document.documentElement.dataset.theme);

  if (saved) {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Switches between the light and dark themes. The choice is applied to the
 * page straight away and saved in a cookie, so the server renders the same
 * theme on the next visit. Both icons are rendered and CSS shows the right
 * one, which keeps the server and browser output identical.
 */
export function ThemeToggle({ className }: { readonly className?: string }) {
  function toggle() {
    const next = oppositeTheme(currentTheme());

    document.documentElement.dataset.theme = next;
    document.cookie = `${themeCookieName}=${next}; path=/; max-age=${themeCookieMaxAgeSeconds}; samesite=lax`;
  }

  return (
    <button
      className={`icon-button theme-toggle${className ? ` ${className}` : ""}`}
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Switch theme"
    >
      <svg className="theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
      </svg>
      <svg className="theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
