"use client";

import dynamic from "next/dynamic";

import {
  inviteToVideoCallAction,
  loadCallShareAction,
  openVideoCallAction,
  startCallShareAction,
  stopCallShareAction,
} from "@/app/calls/actions";
import type { DocumentViewers } from "@/interfaces/services/document-viewer.interface";
import type { VideoCallPageState } from "@/models/video/video-call.model";
import { VideoCallScreen } from "@/views/video/video-call-screen.view";

// The media client needs browser APIs, and only this page should load it.
const LiveKitCallRoom = dynamic(
  () => import("@/lib/livekit/livekit-call-room").then((module) => module.LiveKitCallRoom),
  { ssr: false },
);

// pdf.js and docx-preview load only when someone presents that kind of file.
const viewers: DocumentViewers = {
  Pdf: dynamic(
    () => import("@/lib/documents/pdf-canvas-viewer").then((module) => module.PdfCanvasViewer),
    { ssr: false },
  ),
  Docx: dynamic(
    () => import("@/lib/documents/docx-html-viewer").then((module) => module.DocxHtmlViewer),
    { ssr: false },
  ),
};

const actions = {
  invite: inviteToVideoCallAction,
  open: openVideoCallAction,
  startShare: startCallShareAction,
  stopShare: stopCallShareAction,
  loadShare: loadCallShareAction,
};

/** Client entry point: assembles the LiveKit call room for the view. */
export function ConnectedVideoCall({ state }: { readonly state: VideoCallPageState }) {
  return (
    <VideoCallScreen
      state={state}
      Room={LiveKitCallRoom}
      viewers={viewers}
      actions={actions}
    />
  );
}
