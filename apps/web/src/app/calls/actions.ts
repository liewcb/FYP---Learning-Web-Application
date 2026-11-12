"use server";

import { createProfileController, createVideoCallController } from "@/lib/dependencies/server";
import { parseChatId } from "@/models/chat/chat.model";
import type {
  CallShareState,
  VideoCallInviteState,
  VideoCallOpenState,
} from "@/models/video/video-call.model";

// Server Actions are public entry points, so every action checks the account.
async function isStudent(): Promise<boolean> {
  return (await currentStudentId()) !== null;
}

async function currentStudentId(): Promise<string | null> {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  return viewer?.role === "student" ? viewer.id : null;
}

/** Joins the chat's call in progress, or starts one when `start` is true. */
export async function openVideoCallAction(
  conversationId: number,
  start: boolean,
): Promise<VideoCallOpenState> {
  const id = parseChatId(conversationId);

  if (id === null || !(await isStudent())) {
    return { error: "The call could not be opened." };
  }

  const calls = await createVideoCallController();

  return calls.open(id, start === true);
}

export async function inviteToVideoCallAction(
  callId: number,
  studentId: string,
): Promise<VideoCallInviteState> {
  const id = parseChatId(callId);

  if (id === null || typeof studentId !== "string" || !(await isStudent())) {
    return { error: "The invitation could not be sent." };
  }

  const calls = await createVideoCallController();

  return calls.invite(id, studentId);
}

/** Presents one of the student's own documents in the call. */
export async function startCallShareAction(
  callId: number,
  documentId: number,
): Promise<CallShareState> {
  const id = parseChatId(callId);
  const document = parseChatId(documentId);

  if (id === null || document === null || !(await isStudent())) {
    return { error: "The document could not be presented." };
  }

  const calls = await createVideoCallController();

  return calls.startShare(id, document);
}

export async function stopCallShareAction(callId: number): Promise<CallShareState> {
  const id = parseChatId(callId);
  const viewerId = await currentStudentId();

  if (id === null || viewerId === null) {
    return { error: "The presentation could not be stopped." };
  }

  const calls = await createVideoCallController();

  return calls.stopShare(id, viewerId);
}

/** What is presented in the call now; another browser said it changed. */
export async function loadCallShareAction(callId: number): Promise<CallShareState> {
  const id = parseChatId(callId);

  if (id === null || !(await isStudent())) {
    return { error: "The presentation could not be loaded." };
  }

  try {
    const calls = await createVideoCallController();

    return { share: await calls.currentShare(id) };
  } catch (error) {
    console.error("Loading presentation failed.", error);
    return { error: "The presentation could not be loaded." };
  }
}

/** The student left the call; it ends if nobody else is still in it. */
export async function leaveVideoCallAction(callId: number): Promise<void> {
  const id = parseChatId(callId);
  const viewerId = await currentStudentId();

  if (id === null || viewerId === null) {
    return;
  }

  const calls = await createVideoCallController();

  await calls.leave(id, viewerId);
}
