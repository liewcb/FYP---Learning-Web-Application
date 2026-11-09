import type { CallShareRecord, VideoCall } from "@/models/video/video-call.model";

/** Video calls of the signed-in student. Outcomes are the database's. */
export interface VideoCallRepository {
  /** The chat's call in progress; starts one when `start` is true. */
  open(
    conversationId: number,
    start: boolean,
  ): Promise<{ readonly outcome: string; readonly callId: number | null }>;
  /** Null unless the student is a chat member or was invited. */
  find(callId: number): Promise<VideoCall | null>;
  invite(callId: number, studentId: string): Promise<string>;
  /** Marks a call ended once its room is empty; runs with server privileges. */
  end(callId: number): Promise<void>;
  /** Presents one of the student's own documents, replacing any other. */
  startShare(
    callId: number,
    documentId: number,
  ): Promise<{ readonly outcome: string; readonly shareId: number | null }>;
  /** `presenterGone` lets anyone in the call stop a presenter who has left. */
  stopShare(callId: number, presenterGone: boolean): Promise<string>;
  /** Null when nothing is presented or the student may not join the call. */
  findShare(callId: number): Promise<CallShareRecord | null>;
}
