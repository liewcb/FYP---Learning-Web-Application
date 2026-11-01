import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  createChatController,
  createProfileController,
} from "@/lib/dependencies/server";
import { authRoutes } from "@/models/auth/auth-routes";
import { parseChatId } from "@/models/chat/chat.model";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/chats/attachments/[messageId]">,
) {
  const profiles = await createProfileController();

  if (!(await profiles.currentViewer())) {
    redirect(authRoutes.signIn);
  }

  const { messageId } = await context.params;
  const id = parseChatId(messageId);

  if (id === null) {
    return new Response("Attachment not found.", { status: 404 });
  }

  const chats = await createChatController();
  const url = await chats.attachmentDownloadUrl(id);

  if (!url) {
    return new Response("Attachment not found.", { status: 404 });
  }

  redirect(url);
}
