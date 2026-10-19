export const themes = ["light", "dark"] as const;

export type Theme = (typeof themes)[number];

/** Cookie that remembers the chosen theme so pages render without a flash. */
export const themeCookieName = "athenix-theme";

export const themeCookieMaxAgeSeconds = 365 * 24 * 60 * 60;

/** Returns null when no valid choice is saved, meaning "follow the system". */
export function parseTheme(value: string | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
