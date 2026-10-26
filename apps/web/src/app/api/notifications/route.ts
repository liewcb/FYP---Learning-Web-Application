import type { NextRequest } from "next/server";

import {
  createNotificationController,
  createProfileController,
} from "@/lib/dependencies/server";

const noStore = { "Cache-Control": "no-store" };

async function isSignedIn(): Promise<boolean> {
  const profiles = await createProfileController();

  return (await profiles.currentViewer()) !== null;
}

/** Recent notifications and the unread count for the notification bell. */
export async function GET() {
  if (!(await isSignedIn())) {
    return Response.json({ error: "Sign in required." }, { status: 401, headers: noStore });
  }

  const notifications = await createNotificationController();

  return Response.json(await notifications.summary(), { headers: noStore });
}

/** Marks every notification as read when the student opens the bell. */
export async function POST(request: NextRequest) {
  // Only the app's own pages may change notification state.
  const origin = request.headers.get("origin");

  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return Response.json({ error: "Cross-origin request." }, { status: 403, headers: noStore });
  }

  if (!(await isSignedIn())) {
    return Response.json({ error: "Sign in required." }, { status: 401, headers: noStore });
  }

  const notifications = await createNotificationController();
  await notifications.markAllRead();

  return new Response(null, { status: 204, headers: noStore });
}
