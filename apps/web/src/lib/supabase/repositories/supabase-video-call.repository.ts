import type { SupabaseClient } from "@supabase/supabase-js";

import type { VideoCallRepository } from "@/interfaces/repositories/video-call.repository";
import {
  sharedDocumentKind,
  type CallShareRecord,
  type VideoCall,
} from "@/models/video/video-call.model";

interface VideoCallRow {
  call_id: number;
  conversation_id: number;
  kind: string;
  title: string | null;
  started_by_name: string | null;
  started_at: string;
  ended_at: string | null;
  can_join: boolean;
  can_invite: boolean;
  is_chat_member: boolean;
  party_ids: string[] | null;
  invited_names: string[] | null;
}

interface CallShareRow {
  share_id: number;
  sharer_id: string;
  sharer_name: string;
  document_title: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
}

/** Table-returning functions come back as an array with one row. */
function firstRow<T>(data: unknown): T | null {
  return Array.isArray(data) ? ((data[0] as T | undefined) ?? null) : null;
}

export class SupabaseVideoCallRepository implements VideoCallRepository {
  /**
   * `createServerClient` builds the service-role client, used only to mark
   * calls ended; it is created on demand so other calls never need it.
   */
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly createServerClient: () => SupabaseClient,
  ) {}

  async open(
    conversationId: number,
    start: boolean,
  ): Promise<{ readonly outcome: string; readonly callId: number | null }> {
    const { data, error } = await this.supabase.rpc("open_video_call", {
      p_conversation: conversationId,
      p_start: start,
    });

    if (error) {
      throw new Error(`Unable to open video call: ${error.message}`);
    }

    const row = firstRow<{ outcome: unknown; opened_call_id: number | null }>(data);

    if (typeof row?.outcome !== "string") {
      throw new Error(`Unexpected open video call result: ${String(row?.outcome)}`);
    }

    return { outcome: row.outcome, callId: row.opened_call_id };
  }

  async find(callId: number): Promise<VideoCall | null> {
    const { data, error } = await this.supabase.rpc("get_video_call", { p_call: callId });

    if (error) {
      throw new Error(`Unable to load video call: ${error.message}`);
    }

    const row = firstRow<VideoCallRow>(data);

    return row
      ? {
          id: row.call_id,
          conversationId: row.conversation_id,
          kind: row.kind === "group" ? "group" : "direct",
          title: row.title || "Video call",
          startedByName: row.started_by_name ?? "A student",
          startedAt: row.started_at,
          endedAt: row.ended_at,
          canJoin: row.can_join,
          canInvite: row.can_invite,
          isChatMember: row.is_chat_member,
          partyIds: row.party_ids ?? [],
          invitedNames: row.invited_names ?? [],
        }
      : null;
  }

  async invite(callId: number, studentId: string): Promise<string> {
    const { data, error } = await this.supabase.rpc("invite_to_video_call", {
      p_call: callId,
      p_invitee: studentId,
    });

    if (error) {
      throw new Error(`Unable to invite to video call: ${error.message}`);
    }

    if (typeof data !== "string") {
      throw new Error(`Unexpected video call invite result: ${String(data)}`);
    }

    return data;
  }

  async end(callId: number): Promise<void> {
    const { error } = await this.createServerClient().rpc("end_video_call", { p_call: callId });

    if (error) {
      throw new Error(`Unable to end video call: ${error.message}`);
    }
  }

  async startShare(
    callId: number,
    documentId: number,
  ): Promise<{ readonly outcome: string; readonly shareId: number | null }> {
    const { data, error } = await this.supabase.rpc("start_call_share", {
      p_call: callId,
      p_document: documentId,
    });

    if (error) {
      throw new Error(`Unable to present document: ${error.message}`);
    }

    const row = firstRow<{ outcome: unknown; share_id: number | null }>(data);

    if (typeof row?.outcome !== "string") {
      throw new Error(`Unexpected present document result: ${String(row?.outcome)}`);
    }

    return { outcome: row.outcome, shareId: row.share_id };
  }

  async stopShare(callId: number, presenterGone: boolean): Promise<string> {
    const { data, error } = await this.supabase.rpc("stop_call_share", {
      p_call: callId,
      p_presenter_gone: presenterGone,
    });

    if (error) {
      throw new Error(`Unable to stop presenting: ${error.message}`);
    }

    if (typeof data !== "string") {
      throw new Error(`Unexpected stop presenting result: ${String(data)}`);
    }

    return data;
  }

  async findShare(callId: number): Promise<CallShareRecord | null> {
    const { data, error } = await this.supabase.rpc("get_call_share", { p_call: callId });

    if (error) {
      throw new Error(`Unable to load presented document: ${error.message}`);
    }

    const row = firstRow<CallShareRow>(data);

    return row
      ? {
          id: row.share_id,
          sharerId: row.sharer_id,
          sharerName: row.sharer_name,
          title: row.document_title,
          fileName: row.file_name,
          kind: sharedDocumentKind(row.mime_type),
          sizeBytes: Number(row.size_bytes),
          storagePath: row.storage_path,
        }
      : null;
  }
}
