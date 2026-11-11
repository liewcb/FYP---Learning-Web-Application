import type { SupabaseClient } from "@supabase/supabase-js";

import type { ForumRepository } from "@/interfaces/repositories/forum.repository";
import {
  createInitials,
  type CreateForumAttachmentInput,
  type CreateForumCommentInput,
  type CreateForumThreadInput,
  type ForumAttachment,
  type ForumAuthor,
  type ForumComment,
  type ForumContentStatus,
  type ForumThread,
  type ForumVisibility,
} from "@/models/forum/forum.model";

interface ProfileRow {
  id: string;
  full_name: string;
  username: string | null;
  avatar_path: string | null;
}

interface ThreadRow {
  id: number;
  author_id: string;
  title: string;
  content: string;
  visibility: ForumVisibility;
  status: ForumContentStatus;
  created_at: string;
  updated_at: string;
  author: ProfileRow | ProfileRow[];
}

interface CommentRow {
  id: number;
  thread_id: number;
  author_id: string;
  parent_comment_id: number | null;
  content: string;
  status: ForumContentStatus;
  created_at: string;
  updated_at: string;
  author: ProfileRow | ProfileRow[];
}

interface AttachmentRow {
  id: number;
  thread_id: number;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  position: number;
}

interface UpvoteRow {
  thread_id: number;
  user_id: string;
}

function relation<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function toAuthor(row: ProfileRow): ForumAuthor {
  const displayName = row.full_name.trim() || row.username || "Student";

  return {
    id: row.id,
    displayName,
    username: row.username,
    avatarPath: row.avatar_path,
    initials: createInitials(displayName),
  };
}

function toComment(row: CommentRow, viewerId: string): ForumComment {
  return {
    id: row.id,
    threadId: row.thread_id,
    author: toAuthor(relation(row.author)),
    parentCommentId: row.parent_comment_id,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canDelete: row.author_id === viewerId,
  };
}

function toAttachment(row: AttachmentRow): ForumAttachment {
  return {
    id: row.id,
    threadId: row.thread_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    position: row.position,
    url: null,
  };
}

export class SupabaseForumRepository implements ForumRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listThreads(input: {
    readonly scope: "community" | "mine";
    readonly viewerId: string;
    readonly limit: number;
  }): Promise<ForumThread[]> {
    let query = this.supabase
      .from("forum_threads")
      .select(`
        id,
        author_id,
        title,
        content,
        visibility,
        status,
        created_at,
        updated_at,
        author:profiles!forum_threads_author_id_fkey(
          id,
          full_name,
          username,
          avatar_path
        )
      `)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(input.limit);

    query = input.scope === "mine"
      ? query.eq("author_id", input.viewerId)
      : query.eq("visibility", "community");

    const { data: threadData, error: threadError } = await query;

    if (threadError) {
      throw new Error(`Unable to load forum threads: ${threadError.message}`);
    }

    const rows = (threadData ?? []) as unknown as ThreadRow[];

    if (rows.length === 0) {
      return [];
    }

    const threadIds = rows.map((row) => row.id);
    const [attachmentResult, commentResult, upvoteResult] = await Promise.all([
      this.supabase
        .from("forum_attachments")
        .select("id, thread_id, storage_path, file_name, mime_type, size_bytes, position")
        .in("thread_id", threadIds)
        .order("position", { ascending: true }),
      this.supabase
        .from("forum_comments")
        .select(`
          id,
          thread_id,
          author_id,
          parent_comment_id,
          content,
          status,
          created_at,
          updated_at,
          author:profiles!forum_comments_author_id_fkey(
            id,
            full_name,
            username,
            avatar_path
          )
        `)
        .in("thread_id", threadIds)
        .eq("status", "published")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      this.supabase
        .from("forum_thread_upvotes")
        .select("thread_id, user_id")
        .in("thread_id", threadIds),
    ]);

    if (attachmentResult.error) {
      throw new Error(`Unable to load forum attachments: ${attachmentResult.error.message}`);
    }

    if (commentResult.error) {
      throw new Error(`Unable to load forum comments: ${commentResult.error.message}`);
    }

    if (upvoteResult.error) {
      throw new Error(`Unable to load forum upvotes: ${upvoteResult.error.message}`);
    }

    const attachments = (attachmentResult.data ?? []) as AttachmentRow[];
    const comments = (commentResult.data ?? []) as unknown as CommentRow[];
    const upvotes = (upvoteResult.data ?? []) as UpvoteRow[];

    return rows.map((row) => {
      const threadUpvotes = upvotes.filter((vote) => vote.thread_id === row.id);

      return {
        id: row.id,
        author: toAuthor(relation(row.author)),
        title: row.title,
        content: row.content,
        visibility: row.visibility,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        attachments: attachments
          .filter((attachment) => attachment.thread_id === row.id)
          .map(toAttachment),
        comments: comments
          .filter((comment) => comment.thread_id === row.id)
          .map((comment) => toComment(comment, input.viewerId)),
        upvoteCount: threadUpvotes.length,
        viewerHasUpvoted: threadUpvotes.some(
          (vote) => vote.user_id === input.viewerId,
        ),
        canDelete: row.author_id === input.viewerId,
      } satisfies ForumThread;
    });
  }

  async createThread(input: CreateForumThreadInput): Promise<number> {
    const { data, error } = await this.supabase
      .from("forum_threads")
      .insert({
        author_id: input.authorId,
        title: input.title,
        content: input.content,
        visibility: input.visibility,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Unable to create forum thread: ${error.message}`);
    }

    return (data as { id: number }).id;
  }

  async createAttachment(input: CreateForumAttachmentInput): Promise<void> {
    const { error } = await this.supabase.from("forum_attachments").insert({
      thread_id: input.threadId,
      uploader_id: input.uploaderId,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      position: input.position,
    });

    if (error) {
      throw new Error(`Unable to save forum attachment: ${error.message}`);
    }
  }

  async listAttachmentPaths(threadId: number): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("forum_attachments")
      .select("storage_path")
      .eq("thread_id", threadId);

    if (error) {
      throw new Error(`Unable to load forum attachment paths: ${error.message}`);
    }

    return (data as { storage_path: string }[]).map((row) => row.storage_path);
  }

  async deleteThread(threadId: number): Promise<void> {
    const { data, error } = await this.supabase
      .from("forum_threads")
      .delete()
      .eq("id", threadId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to delete forum thread: ${error.message}`);
    }

    if (!data) {
      throw new Error("Forum thread was not found or is not owned by this user.");
    }
  }

  async createComment(input: CreateForumCommentInput): Promise<void> {
    const { error } = await this.supabase.from("forum_comments").insert({
      thread_id: input.threadId,
      author_id: input.authorId,
      parent_comment_id: input.parentCommentId ?? null,
      content: input.content,
    });

    if (error) {
      throw new Error(`Unable to add forum comment: ${error.message}`);
    }
  }

  async deleteComment(commentId: number): Promise<void> {
    const { data, error } = await this.supabase
      .from("forum_comments")
      .delete()
      .eq("id", commentId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to delete forum comment: ${error.message}`);
    }

    if (!data) {
      throw new Error("Forum comment was not found or is not owned by this user.");
    }
  }

  async toggleUpvote(threadId: number, userId: string): Promise<void> {
    const { data: existing, error: selectError } = await this.supabase
      .from("forum_thread_upvotes")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .maybeSingle();

    if (selectError) {
      throw new Error(`Unable to check forum upvote: ${selectError.message}`);
    }

    const { error } = existing
      ? await this.supabase
          .from("forum_thread_upvotes")
          .delete()
          .eq("thread_id", threadId)
          .eq("user_id", userId)
      : await this.supabase.from("forum_thread_upvotes").insert({
          thread_id: threadId,
          user_id: userId,
        });

    if (error) {
      throw new Error(`Unable to update forum upvote: ${error.message}`);
    }
  }

  async report(input: {
    readonly reporterId: string;
    readonly threadId: number | null;
    readonly commentId: number | null;
    readonly reason: string;
  }): Promise<boolean> {
    // One pending report per student and post is enough for moderators.
    let existing = this.supabase
      .from("forum_reports")
      .select("id", { head: true, count: "exact" })
      .eq("reporter_id", input.reporterId)
      .eq("status", "pending");

    existing = input.threadId !== null
      ? existing.eq("thread_id", input.threadId)
      : existing.eq("comment_id", input.commentId ?? 0);

    const { count, error: countError } = await existing;

    if (countError) {
      throw new Error(`Unable to check forum reports: ${countError.message}`);
    }

    if ((count ?? 0) > 0) {
      return false;
    }

    const { error } = await this.supabase.from("forum_reports").insert({
      reporter_id: input.reporterId,
      thread_id: input.threadId,
      comment_id: input.commentId,
      reason: input.reason,
    });

    if (error) {
      throw new Error(`Unable to report forum content: ${error.message}`);
    }

    return true;
  }
}
