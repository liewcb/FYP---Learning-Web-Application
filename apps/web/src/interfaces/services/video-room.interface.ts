import type { ComponentType, ReactNode } from "react";

import type { CallShareMessage } from "@/models/video/video-call.model";

/** The media server that carries call audio and video (server side). */
export interface VideoRoomService {
  /** Browser address of the media server, or null when it is not configured. */
  readonly serverUrl: string | null;
  /** Identities of everyone connected to the room; empty when it does not exist. */
  participantIdentities(room: string): Promise<string[]>;
  /** Whether the room is open; the media server closes empty rooms by itself. */
  roomIsOpen(room: string): Promise<boolean>;
  /** Creates the room with the participant limit, or keeps the existing one. */
  prepareRoom(room: string, maxParticipants: number): Promise<void>;
  /** A short-lived token that lets one student join one room. */
  createJoinToken(input: {
    readonly room: string;
    readonly identity: string;
    readonly name: string;
  }): Promise<string>;
}

/** Small messages between the browsers in a call (who presents which page). */
export interface CallChannel {
  /** Everyone in the call except this browser. */
  send(message: CallShareMessage): void;
  /** Messages from others, unchecked. Returns unsubscribe. */
  subscribe(handler: (message: unknown, fromIdentity: string) => void): () => void;
  /** Someone joined the call. Returns unsubscribe. */
  onParticipantJoined(handler: (identity: string) => void): () => void;
  /** Runs once connected (straight away if already). Returns unsubscribe. */
  onConnected(handler: () => void): () => void;
  /** Whether a student is connected to the call right now. */
  isConnected(identity: string): boolean;
}

export interface VideoCallRoomProps {
  readonly serverUrl: string;
  readonly token: string;
  /** The student left the call or was disconnected. */
  readonly onLeave: () => void;
  /** Shown beside the video grid, e.g. a presented document. */
  readonly renderStage: (channel: CallChannel) => ReactNode;
}

/** The in-call screen (video grid and controls), supplied by the route. */
export type VideoCallRoom = ComponentType<VideoCallRoomProps>;
