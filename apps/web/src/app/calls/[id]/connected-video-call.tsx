"use client";

import dynamic from "next/dynamic";

import {
  inviteToVideoCallAction,
  leaveVideoCallAction,
  loadCallShareAction,
  openVideoCallAction,
  startCallShareAction,
  stopCallShareAction,
} from "@/app/calls/actions";
import { documentViewers } from "@/lib/documents/document-viewers";
import type { VideoCallPageState } from "@/models/video/video-call.model";
import { VideoCallScreen } from "@/views/video/video-call-screen.view";

// The media client needs browser APIs, and only this page should load it.
const LiveKitCallRoom = dynamic(
  () => import("@/lib/livekit/livekit-call-room").then((module) => module.LiveKitCallRoom),
  { ssr: false },
);

const actions = {
  invite: inviteToVideoCallAction,
  open: openVideoCallAction,
  startShare: startCallShareAction,
  stopShare: stopCallShareAction,
  loadShare: loadCallShareAction,
  leave: leaveVideoCallAction,
};

/** Client entry point: assembles the LiveKit call room for the view. */
export function ConnectedVideoCall({ state }: { readonly state: VideoCallPageState }) {
  return (
    <VideoCallScreen
      state={state}
      Room={LiveKitCallRoom}
      viewers={documentViewers}
      actions={actions}
    />
  );
}
