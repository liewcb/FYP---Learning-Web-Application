import type { NextRequest } from "next/server";

import { createProfileController } from "@/lib/dependencies/server";

/** Kept by the browser for six hours; the signed link it points to lasts a day. */
const browserCacheSeconds = 6 * 60 * 60;

/**
 * Shows a profile picture to signed-in users. Pictures are private files, so
 * this checks the session and redirects to a short-lived signed link. Each
 * picture has its own name, so the browser can keep the answer.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/avatars/[owner]/[file]">,
) {
  const { owner, file } = await context.params;
  const profiles = await createProfileController();
  const url = await profiles.avatarViewUrl(`${owner}/${file}`);

  if (!url) {
    return new Response("Picture not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return new Response(null, {
    status: 307,
    headers: { Location: url, "Cache-Control": `private, max-age=${browserCacheSeconds}` },
  });
}
