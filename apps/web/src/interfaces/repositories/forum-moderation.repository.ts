import type {
  ForumReport,
  ModeratedComment,
  ModeratedThread,
  ModerationAction,
  ModerationKind,
  ModerationOutcome,
} from "@/models/admin/forum-moderation.model";

/** Admin-only forum moderation. The database refuses non-admin callers. */
export interface ForumModerationRepository {
  listReports(status: string, limit: number): Promise<ForumReport[]>;
  listThreads(status: string, search: string, limit: number): Promise<ModeratedThread[]>;
  listComments(status: string, search: string, limit: number): Promise<ModeratedComment[]>;
  moderate(
    kind: ModerationKind,
    id: number,
    action: ModerationAction,
    reason: string | null,
  ): Promise<ModerationOutcome>;
  dismissReport(reportId: number, note: string | null): Promise<ModerationOutcome>;
}
