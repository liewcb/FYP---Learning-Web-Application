import type { NextRequest } from "next/server";

import {
  createChatController,
  createProfileController,
} from "@/lib/dependencies/server";

const noStore = { "Cache-Control": "no-store" };

/**
 * Polled by the Chats badge on every student page: records that the student
 * is online, marks waiting messages as delivered and returns unread chats.
 */
export async function POST(request: NextRequest) {
  // Only the app's own pages may change chat state.
  const origin = request.headers.get("origin");

  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return Response.json({ error: "Cross-origin request." }, { status: 403, headers: noStore });
  }

  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    return Response.json({ error: "Sign in required." }, { status: 401, headers: noStore });
  }

  if (viewer.role !== "student") {
    return Response.json({ unreadCount: 0 }, { headers: noStore });
  }

  const chats = await createChatController();

  return Response.json({ unreadCount: await chats.syncInbox() }, { headers: noStore });
}
