import type { SupabaseClient } from "@supabase/supabase-js";

import { avatarHref } from "@/models/profile/avatar.model";

/**
 * Picture links for the given students, by id; students without a picture
 * are left out. Lists of people come from database functions that do not
 * return pictures, so they are looked up here in one query. Pictures are
 * extra: if the lookup fails, everyone is shown with initials.
 */
export async function loadAvatarUrls(
  supabase: SupabaseClient,
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];

  if (unique.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, avatar_path")
    .in("id", unique)
    .not("avatar_path", "is", null);

  if (error) {
    console.error("Loading profile pictures failed.", error);
    return new Map();
  }

  const urls = new Map<string, string>();

  for (const row of data as { id: string; avatar_path: string | null }[]) {
    const url = avatarHref(row.avatar_path);

    if (url) {
      urls.set(row.id, url);
    }
  }

  return urls;
}
