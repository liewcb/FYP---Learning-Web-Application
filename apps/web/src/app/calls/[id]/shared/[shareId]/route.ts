import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  createProfileController,
  createVideoCallController,
} from "@/lib/dependencies/server";
import { authRoutes } from "@/models/auth/auth-routes";
import { parseChatId } from "@/models/chat/chat.model";

/**
 * Opens the document presented in a call. Access is checked on every visit,
 * then the browser is sent to a link that expires within a minute.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/calls/[id]/shared/[shareId]">,
) {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  const { id, shareId } = await context.params;
  const callId = parseChatId(id);
  const share = parseChatId(shareId);

  if (callId === null || share === null || viewer.role !== "student") {
    return new Response("Document not found.", { status: 404 });
  }

  const calls = await createVideoCallController();
  const url = await calls.sharedFileUrl(callId, share);

  if (!url) {
    return new Response("Document not found.", { status: 404 });
  }

  redirect(url);
}
