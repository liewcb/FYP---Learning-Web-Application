import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChatGroupRepository } from "@/interfaces/repositories/chat-group.repository";
import {
  academicLine,
  groupInitials,
  participantInitials,
  participantName,
  type ChatGroupCommand,
  type ChatGroupInvite,
  type ChatGroupMember,
} from "@/models/chat/chat.model";
import { loadAvatarUrls } from "@/lib/supabase/repositories/avatar-urls";

interface InviteRow {
  invite_id: number;
  group_id: number;
  group_title: string;
  inviter_full_name: string;
  inviter_username: string | null;
  member_count: number;
  created_at: string;
}

interface MemberRow {
  user_id: string;
  full_name: string;
  username: string | null;
  academic_major: string | null;
  year_of_study: number | null;
  last_seen_at: string | null;
  is_buddy: boolean;
  status: ChatGroupMember["status"];
  invite_id: number | null;
  since: string;
}

/** Table-returning functions come back as an array with one row. */
function firstRow<T>(data: unknown): T | null {
  return Array.isArray(data) ? ((data[0] as T | undefined) ?? null) : null;
}

function text(data: unknown, name: string): string {
  if (typeof data !== "string") {
    throw new Error(`Unexpected ${name} result: ${String(data)}`);
  }

  return data;
}

export class SupabaseChatGroupRepository implements ChatGroupRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(
    title: string,
    inviteeIds: readonly string[],
  ): Promise<{ readonly outcome: string; readonly groupId: number | null }> {
    const { data, error } = await this.supabase.rpc("create_group_chat", {
      p_title: title,
      p_invitees: inviteeIds,
    });

    if (error) {
      throw new Error(`Unable to create group: ${error.message}`);
    }

    const row = firstRow<{ outcome: unknown; group_id: number | null }>(data);

    return { outcome: text(row?.outcome, "create group"), groupId: row?.group_id ?? null };
  }

  async listInvites(): Promise<ChatGroupInvite[]> {
    const { data, error } = await this.supabase.rpc("list_my_group_invites");

    if (error) {
      throw new Error(`Unable to load group invitations: ${error.message}`);
    }

    return (data as InviteRow[]).map((row) => ({
      id: row.invite_id,
      groupId: row.group_id,
      title: row.group_title,
      initials: groupInitials(row.group_title),
      inviterName: participantName(row.inviter_full_name, row.inviter_username),
      memberCount: row.member_count,
      createdAt: row.created_at,
    }));
  }

  async respondToInvite(
    inviteId: number,
    accept: boolean,
  ): Promise<{ readonly outcome: string; readonly groupId: number | null }> {
    const { data, error } = await this.supabase.rpc("respond_to_group_invite", {
      p_invite: inviteId,
      p_accept: accept,
    });

    if (error) {
      throw new Error(`Unable to answer group invitation: ${error.message}`);
    }

    const row = firstRow<{ outcome: unknown; group_id: number | null }>(data);

    return { outcome: text(row?.outcome, "group invitation"), groupId: row?.group_id ?? null };
  }

  async listMembers(groupId: number): Promise<ChatGroupMember[]> {
    const { data, error } = await this.supabase.rpc("list_group_members", {
      p_conversation: groupId,
    });

    if (error) {
      throw new Error(`Unable to load group members: ${error.message}`);
    }

    const rows = data as MemberRow[];
    const avatars = await loadAvatarUrls(this.supabase, rows.map((row) => row.user_id));

    return rows.map((row) => ({
      id: row.user_id,
      fullName: participantName(row.full_name, row.username),
      username: row.username,
      initials: participantInitials(row.full_name, row.username),
      avatarUrl: avatars.get(row.user_id) ?? null,
      academicLine: academicLine(row.academic_major, row.year_of_study),
      lastSeenAt: row.last_seen_at,
      isBuddy: row.is_buddy,
      status: row.status,
      inviteId: row.invite_id,
      since: row.since,
    }));
  }

  async run(groupId: number, command: ChatGroupCommand): Promise<string> {
    const { data, error } = await this.call(groupId, command);

    if (error) {
      throw new Error(`Unable to update group: ${error.message}`);
    }

    return text(data, "group command");
  }

  private call(groupId: number, command: ChatGroupCommand) {
    switch (command.type) {
      case "invite":
        return this.supabase.rpc("invite_to_group", {
          p_conversation: groupId,
          p_invitee: command.studentId,
        });
      case "cancel_invite":
        return this.supabase.rpc("cancel_group_invite", { p_invite: command.inviteId });
      case "leave":
        return this.supabase.rpc("leave_group", { p_conversation: groupId });
      case "remove":
      case "make_admin":
        return this.supabase.rpc("manage_group", {
          p_conversation: groupId,
          p_action: command.type,
          p_member: command.studentId,
        });
      case "rename":
        return this.supabase.rpc("manage_group", {
          p_conversation: groupId,
          p_action: "rename",
          p_title: command.title,
        });
      case "disband":
        return this.supabase.rpc("manage_group", {
          p_conversation: groupId,
          p_action: "disband",
        });
    }
  }
}
