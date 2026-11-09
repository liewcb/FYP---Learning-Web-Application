import "server-only";

import { AccessToken, RoomServiceClient, TwirpError } from "livekit-server-sdk";

import type { VideoRoomService } from "@/interfaces/services/video-room.interface";
import { videoCallRules } from "@/models/video/video-call.model";

/**
 * LiveKit rooms for video calls. LIVEKIT_URL is the wss:// address students'
 * browsers connect to; the API key and secret stay on the server.
 */
export class LiveKitVideoRoomService implements VideoRoomService {
  readonly serverUrl: string | null;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private client: RoomServiceClient | null = null;

  constructor(env: Record<string, string | undefined> = process.env) {
    const url = env.LIVEKIT_URL?.trim();
    this.apiKey = env.LIVEKIT_API_KEY?.trim() ?? "";
    this.apiSecret = env.LIVEKIT_API_SECRET?.trim() ?? "";
    this.serverUrl = url && this.apiKey && this.apiSecret ? url : null;
  }

  async participantIdentities(room: string): Promise<string[]> {
    // Asks the room itself; the room list's participant count can lag behind.
    try {
      const participants = await this.rooms().listParticipants(room);

      return participants.map((participant) => participant.identity);
    } catch (error) {
      // Listing participants of a room that does not exist is an error.
      if (error instanceof TwirpError && (error.code === "not_found" || error.status === 404)) {
        return [];
      }

      throw error;
    }
  }

  async roomIsOpen(room: string): Promise<boolean> {
    const rooms = await this.rooms().listRooms([room]);

    return rooms.some((existing) => existing.name === room);
  }

  async prepareRoom(room: string, maxParticipants: number): Promise<void> {
    // Returns the existing room when it is already open.
    await this.rooms().createRoom({
      name: room,
      maxParticipants,
      emptyTimeout: videoCallRules.emptyRoomTimeoutSeconds,
    });
  }

  async createJoinToken(input: {
    readonly room: string;
    readonly identity: string;
    readonly name: string;
  }): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.identity,
      name: input.name,
      ttl: videoCallRules.tokenTtl,
    });

    token.addGrant({
      room: input.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return token.toJwt();
  }

  private rooms(): RoomServiceClient {
    if (!this.serverUrl) {
      throw new Error("LiveKit is not configured on the server.");
    }

    // The API uses https:// on the same host as the browsers' wss:// address.
    this.client ??= new RoomServiceClient(
      this.serverUrl.replace(/^ws(s?):\/\//, "http$1://"),
      this.apiKey,
      this.apiSecret,
    );

    return this.client;
  }
}
