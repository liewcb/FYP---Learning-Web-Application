import type { SupabaseClient } from "@supabase/supabase-js";

import type { ForumModerationRepository } from "@/interfaces/repositories/forum-moderation.repository";
import {
  toModeratedStatus,
  type ForumReport,
  type ModeratedComment,
  type ModeratedThread,
  type ModerationAction,
  type ModerationKind,
  type ModerationOutcome,
} from "@/models/admin/forum-moderation.model";

interface ThreadRow {
  id: number;
  title: string;
  content: string;
  status: string;
  author_name: string;
  comment_count: number | string;
  upvote_count: number | string;
  pending_report_count: number | string;
  created_at: string;
}

interface CommentRow {
  id: number;
  thread_id: number;
  thread_title: string;
  content: string;
  status: string;
  author_name: string;
  pending_report_count: number | string;
  created_at: string;
}

interface ReportRow {
  id: number;
  target_kind: string;
  target_id: number;
  thread_title: string | null;
  target_content: string | null;
  target_status: string | null;
  target_author_name: string;
  reporter_name: string;
  reason: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

const outcomes = new Set<ModerationOutcome>([
  "updated",
  "unchanged",
  "not_found",
  "invalid",
  "reason_required",
]);

function outcome(value: unknown): ModerationOutcome {
  return typeof value === "string" && outcomes.has(value as ModerationOutcome)
    ? (value as ModerationOutcome)
    : "invalid";
}

export class SupabaseForumModerationRepository implements ForumModerationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listReports(status: string, limit: number): Promise<ForumReport[]> {
    const { data, error } = await this.supabase.rpc("admin_list_forum_reports", {
      p_status: status,
      p_limit: limit,
    });

    if (error) {
      throw new Error(`Unable to load forum reports: ${error.message}`);
    }

    return ((data ?? []) as ReportRow[]).map((row) => ({
      id: row.id,
      targetKind: row.target_kind === "comment" ? "comment" : "thread",
      targetId: row.target_id,
      threadTitle: row.thread_title ?? "Deleted thread",
      targetContent: row.target_content ?? "",
      targetStatus: toModeratedStatus(row.target_status ?? "deleted"),
      targetAuthorName: row.target_author_name,
      reporterName: row.reporter_name,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    }));
  }

  async listThreads(status: string, search: string, limit: number): Promise<ModeratedThread[]> {
    const { data, error } = await this.supabase.rpc("admin_list_forum_threads", {
      p_status: status,
      p_search: search || null,
      p_limit: limit,
    });

    if (error) {
      throw new Error(`Unable to load forum threads: ${error.message}`);
    }

    return ((data ?? []) as ThreadRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      status: toModeratedStatus(row.status),
      authorName: row.author_name,
      commentCount: Number(row.comment_count),
      upvoteCount: Number(row.upvote_count),
      pendingReportCount: Number(row.pending_report_count),
      createdAt: row.created_at,
    }));
  }

  async listComments(status: string, search: string, limit: number): Promise<ModeratedComment[]> {
    const { data, error } = await this.supabase.rpc("admin_list_forum_comments", {
      p_status: status,
      p_search: search || null,
      p_limit: limit,
    });

    if (error) {
      throw new Error(`Unable to load forum comments: ${error.message}`);
    }

    return ((data ?? []) as CommentRow[]).map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      threadTitle: row.thread_title,
      content: row.content,
      status: toModeratedStatus(row.status),
      authorName: row.author_name,
      pendingReportCount: Number(row.pending_report_count),
      createdAt: row.created_at,
    }));
  }

  async moderate(
    kind: ModerationKind,
    id: number,
    action: ModerationAction,
    reason: string | null,
  ): Promise<ModerationOutcome> {
    const { data, error } = await this.supabase.rpc("admin_moderate_forum_content", {
      p_kind: kind,
      p_id: id,
      p_action: action,
      p_reason: reason,
    });

    if (error) {
      throw new Error(`Unable to moderate forum content: ${error.message}`);
    }

    return outcome(data);
  }

  async dismissReport(reportId: number, note: string | null): Promise<ModerationOutcome> {
    const { data, error } = await this.supabase.rpc("admin_dismiss_forum_report", {
      p_report: reportId,
      p_note: note,
    });

    if (error) {
      throw new Error(`Unable to dismiss report: ${error.message}`);
    }

    return outcome(data);
  }
}
