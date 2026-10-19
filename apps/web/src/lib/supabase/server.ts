import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import {
  applySessionPreference,
  isPersistentSession,
  rememberCookieName,
  rememberCookieOptions,
} from "@/lib/supabase/session-preference";

interface CreateClientOptions {
  /**
   * Overrides the saved "Remember me" choice. Passed while signing in, and
   * saved so later requests (and the proxy) keep the same cookie lifetime.
   */
  readonly persistentSession?: boolean;
}

export async function createClient(options: CreateClientOptions = {}) {
  const cookieStore = await cookies();
  const persistent =
    options.persistentSession ??
    isPersistentSession(cookieStore.get(rememberCookieName)?.value);

  if (options.persistentSession !== undefined) {
    try {
      cookieStore.set(
        rememberCookieName,
        persistent ? "1" : "0",
        rememberCookieOptions(persistent),
      );
    } catch {
      // Only Server Actions and Route Handlers can write cookies.
    }
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(
                name,
                value,
                applySessionPreference(options, persistent),
              ),
            );
          } catch {
            // Server Components cannot write cookies. The proxy in
            // src/proxy.ts refreshes the session before rendering instead.
          }
        },
      },
    },
  );
}
