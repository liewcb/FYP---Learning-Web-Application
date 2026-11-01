import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { ConnectedChatWorkspace } from "@/app/chats/connected-chat-workspace";
import {
  createChatController,
  createProfileController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { chatHref, parseChatId } from "@/models/chat/chat.model";
import { ChatPageView } from "@/views/chat/chat-page.view";

export const metadata: Metadata = {
  title: "Chats",
};

type SearchParamValue = string | string[] | undefined;

interface ChatsPageProps {
  readonly searchParams: Promise<{
    c?: SearchParamValue;
    with?: SearchParamValue;
  }>;
}

function single(value: SearchParamValue): string {
  return typeof value === "string" ? value : "";
}

export default async function ChatsPage({ searchParams }: ChatsPageProps) {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const params = await searchParams;
  const controller = await createChatController();
  const withStudent = single(params.with);

  // "Message" on a study buddy card opens (or creates) the conversation.
  if (withStudent) {
    const conversationId = await controller.openWith(withStudent);
    redirect(conversationId === null ? "/chats" : chatHref(conversationId));
  }

  const model = await controller.loadPage({
    viewerId: viewer.id,
    conversationId: parseChatId(single(params.c)),
  });

  return (
    <ChatPageView viewer={viewer} signOutAction={signOutAction}>
      <ConnectedChatWorkspace key={model.active?.summary.id ?? "none"} model={model} />
    </ChatPageView>
  );
}
