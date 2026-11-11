import type { ForumModerationRepository } from "@/interfaces/repositories/forum-moderation.repository";
import {
  moderationMessages,
  moderationNotices,
  moderationReasonMax,
  type ForumModerationFilters,
  type ForumModerationModel,
  type ModerationAction,
  type ModerationActionState,
  type ModerationKind,
} from "@/models/admin/forum-moderation.model";

const listLimit = 100;

/** Review reported posts and hide, remove or restore forum content. */
export class ForumModerationController {
  constructor(private readonly forum: ForumModerationRepository) {}

  async load(filters: ForumModerationFilters): Promise<ForumModerationModel> {
    const pending = await this.forum.listReports("pending", 200);
    const pendingCount = pending.length;

    switch (filters.tab) {
      case "reports":
        return {
          tab: "reports",
          filters,
          pendingCount,
          reports:
            filters.status === "pending" ? pending : await this.forum.listReports(filters.status, listLimit),
        };
      case "threads":
        return {
          tab: "threads",
          filters,
          pendingCount,
          threads: await this.forum.listThreads(filters.status, filters.search, listLimit),
        };
      case "comments":
        return {
          tab: "comments",
          filters,
          pendingCount,
          comments: await this.forum.listComments(filters.status, filters.search, listLimit),
        };
    }
  }

  async moderate(
    kind: ModerationKind,
    id: number,
    action: ModerationAction,
    rawReason: string,
  ): Promise<ModerationActionState> {
    const reason = rawReason.trim();

    if (reason.length > moderationReasonMax) {
      return { error: `Keep the reason under ${moderationReasonMax} characters.` };
    }

    try {
      const outcome = await this.forum.moderate(kind, id, action, reason || null);

      return outcome === "updated"
        ? { notice: moderationNotices[action] }
        : { error: moderationMessages[outcome] };
    } catch (error) {
      console.error("Forum moderation failed.", error);

      return { error: "The change could not be saved. Please try again." };
    }
  }

  async dismissReport(reportId: number, rawNote: string): Promise<ModerationActionState> {
    try {
      const outcome = await this.forum.dismissReport(reportId, rawNote.trim().slice(0, moderationReasonMax) || null);

      return outcome === "updated"
        ? { notice: "Report dismissed. The post stays visible." }
        : { error: moderationMessages[outcome] };
    } catch (error) {
      console.error("Dismissing forum report failed.", error);

      return { error: "The report could not be dismissed. Please try again." };
    }
  }
}
