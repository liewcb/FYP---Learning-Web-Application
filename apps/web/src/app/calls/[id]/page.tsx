import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { ConnectedVideoCall } from "@/app/calls/[id]/connected-video-call";
import {
  createProfileController,
  createVideoCallController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { parseChatId } from "@/models/chat/chat.model";
import { VideoCallPageView } from "@/views/video/video-call-page.view";

export const metadata: Metadata = {
  title: "Video call",
};

// Every visit signs a fresh join token.
export const dynamic = "force-dynamic";

export default async function VideoCallPage({ params }: PageProps<"/calls/[id]">) {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const { id } = await params;
  const callId = parseChatId(id);
  const calls = await createVideoCallController();
  const state =
    callId === null
      ? ({ status: "not_found", call: null } as const)
      : await calls.prepareJoin(callId, { id: viewer.id, displayName: viewer.displayName });

  return (
    <VideoCallPageView viewer={viewer} signOutAction={signOutAction}>
      <ConnectedVideoCall state={state} />
    </VideoCallPageView>
  );
}
