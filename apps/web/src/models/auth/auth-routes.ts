export const authRoutes = {
  signIn: "/login",
  signUp: "/register",
  confirm: "/auth/confirm",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  home: "/",
} as const;

const guestOnlyPaths: readonly string[] = [authRoutes.signIn, authRoutes.signUp];

/** Open to everyone, signed in or not. */
const publicPaths: readonly string[] = [authRoutes.forgotPassword];

const publicPrefixes: readonly string[] = ["/auth/", "/api/"];

export function isGuestOnlyPath(pathname: string): boolean {
  return guestOnlyPaths.includes(pathname);
}

export function isPublicPath(pathname: string): boolean {
  return (
    isGuestOnlyPath(pathname) ||
    publicPaths.includes(pathname) ||
    publicPrefixes.some((prefix) => pathname.startsWith(prefix))
  );
}

/**
 * Only allows same-site relative paths, so a crafted `next` parameter cannot
 * send a user to another website after logging in.
 */
export function safeRedirectPath(
  value: unknown,
  fallback: string = authRoutes.home,
): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return fallback;
  }

  return value;
}
