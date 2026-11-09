import type {
  ChatGroupCommand,
  ChatGroupInvite,
  ChatGroupMember,
} from "@/models/chat/chat.model";

/** Small group chats of the signed-in student. Outcomes are the database's. */
export interface ChatGroupRepository {
  /** Creates a group with the student as admin and invites the given buddies. */
  create(
    title: string,
    inviteeIds: readonly string[],
  ): Promise<{ readonly outcome: string; readonly groupId: number | null }>;
  /** Invitations waiting for the student's answer. */
  listInvites(): Promise<ChatGroupInvite[]>;
  respondToInvite(
    inviteId: number,
    accept: boolean,
  ): Promise<{ readonly outcome: string; readonly groupId: number | null }>;
  /** Members, former members and open invitations of a group. */
  listMembers(groupId: number): Promise<ChatGroupMember[]>;
  run(groupId: number, command: ChatGroupCommand): Promise<string>;
}
