import type { ChatGroupRepository } from "@/interfaces/repositories/chat-group.repository";
import {
  chatGroupRules,
  groupOutcomeError,
  isStudentId,
  validateGroupTitle,
  type ChatActionState,
  type ChatGroupCommand,
  type ChatGroupCreateState,
  type ChatGroupMember,
  type ChatInviteResponseState,
} from "@/models/chat/chat.model";

const failed = "This group could not be updated. Please try again.";

/** Creating groups, answering invitations and the admin's group settings. */
export class ChatGroupController {
  constructor(private readonly groups: ChatGroupRepository) {}

  async create(input: {
    readonly title: string;
    readonly memberIds: readonly unknown[];
  }): Promise<ChatGroupCreateState> {
    const titleError = validateGroupTitle(input.title);

    if (titleError) {
      return { error: titleError };
    }

    const memberIds = [...new Set(input.memberIds.filter(isStudentId))];

    if (memberIds.length === 0) {
      return { error: groupOutcomeError("no_members")! };
    }

    if (memberIds.length > chatGroupRules.maxMembers - 1) {
      return { error: groupOutcomeError("too_many")! };
    }

    try {
      const result = await this.groups.create(input.title.trim(), memberIds);
      const error = groupOutcomeError(result.outcome);

      if (error || result.groupId === null) {
        return { error: error ?? "The group could not be created. Please try again." };
      }

      return { groupId: result.groupId };
    } catch (error) {
      console.error("Group creation failed.", error);
      return { error: "The group could not be created. Please try again." };
    }
  }

  async respond(inviteId: number, accept: boolean): Promise<ChatInviteResponseState> {
    try {
      const result = await this.groups.respondToInvite(inviteId, accept);

      switch (result.outcome) {
        case "joined":
          return result.groupId === null ? { error: failed } : { groupId: result.groupId };
        case "declined":
          return { notice: "Invitation declined." };
        case "not_found":
          return { error: "This invitation is no longer available." };
        default:
          return { error: groupOutcomeError(result.outcome) ?? failed };
      }
    } catch (error) {
      console.error("Answering group invitation failed.", error);
      return { error: "The invitation could not be answered. Please try again." };
    }
  }

  async run(groupId: number, command: ChatGroupCommand): Promise<ChatActionState> {
    if (command.type === "rename") {
      const titleError = validateGroupTitle(command.title);

      if (titleError) {
        return { error: titleError };
      }
    }

    try {
      const outcome = await this.groups.run(
        groupId,
        command.type === "rename" ? { ...command, title: command.title.trim() } : command,
      );

      if (outcome === "not_found") {
        return { error: "This member or invitation is no longer in the group." };
      }

      const error = groupOutcomeError(outcome);

      return error ? { error } : {};
    } catch (error) {
      console.error("Group command failed.", error);
      return { error: failed };
    }
  }

  /** Null when the student does not belong to the group. */
  async members(groupId: number): Promise<ChatGroupMember[] | null> {
    try {
      const members = await this.groups.listMembers(groupId);

      return members.length > 0 ? members : null;
    } catch (error) {
      console.error("Loading group members failed.", error);
      return null;
    }
  }
}
