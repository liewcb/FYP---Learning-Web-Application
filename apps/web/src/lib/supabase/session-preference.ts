import type { CookieOptions } from "@supabase/ssr";

/**
 * Remembers the "Remember me" choice. "0" means the login should end when
 * the browser closes; a missing cookie keeps Supabase's long-lived default.
 */
export const rememberCookieName = "athenix-remember";

const oneYearSeconds = 365 * 24 * 60 * 60;

export function isPersistentSession(cookieValue: string | undefined): boolean {
  return cookieValue !== "0";
}

/**
 * Turns Supabase's long-lived auth cookies into browser-session cookies when
 * the user did not tick "Remember me". Removals (maxAge 0) are left alone so
 * signing out still deletes the cookies.
 */
export function applySessionPreference(
  options: CookieOptions,
  persistent: boolean,
): CookieOptions {
  if (persistent || options.maxAge === 0) {
    return options;
  }

  const sessionOnly = { ...options };
  delete sessionOnly.maxAge;
  delete sessionOnly.expires;

  return sessionOnly;
}

/** Cookie settings for the preference cookie itself. */
export function rememberCookieOptions(persistent: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    ...(persistent ? { maxAge: oneYearSeconds } : {}),
  };
}
