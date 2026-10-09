import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * A Supabase client that bypasses row-level security using the secret key.
 * Only use it for narrowly scoped server operations that a signed-out user
 * must not be able to perform directly.
 */
export function createServiceRoleClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set on the server.");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
