import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  applySessionPreference,
  isPersistentSession,
  rememberCookieName,
} from "@/lib/supabase/session-preference";
import {
  authRoutes,
  isPublicPath,
} from "@/models/auth/auth-routes";

function redirectWithCookies(
  request: NextRequest,
  pathname: string,
  from: NextResponse,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  if (pathname === authRoutes.signIn) {
    url.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
  }

  const redirect = NextResponse.redirect(url);
  // Keep any refreshed session cookies on the redirect response.
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));

  return redirect;
}

/**
 * Refreshes the Supabase session cookie on every request and redirects based
 * on whether the visitor is signed in. Server Components cannot write cookies,
 * so this is where expired access tokens get refreshed.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const persistent = isPersistentSession(
    request.cookies.get(rememberCookieName)?.value,
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(
              name,
              value,
              applySessionPreference(options, persistent),
            ),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not add code between createServerClient and getClaims: the session
  // must be refreshed before anything decides who the user is.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!isSignedIn && !isPublicPath(pathname)) {
    return redirectWithCookies(request, authRoutes.signIn, response);
  }

  return response;
}
