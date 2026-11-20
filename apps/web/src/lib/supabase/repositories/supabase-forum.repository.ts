import type { SupabaseClient } from "@supabase/supabase-js";

import type { ForumRepository } from "@/interfaces/repositories/forum.repository";
import {
  createInitials,
  type CreateForumAttachmentInput,
  type CreateForumCommentInput,
  type CreateForumThreadInput,
  type UpdateForumCommentInput,
  type UpdateForumThreadInput,
  type ForumAttachment,
  type ForumAuthor,
  type ForumComment,
  type ForumContentStatus,
  type ForumThread,
  type ForumTopicCount,
  type ForumVisibility,
} from "@/models/forum/forum.model";
import type {
  FeedCandidate,
  InterestSignal,
  InterestSource,
} from "@/models/forum/forum-feed.model";
import { avatarHref } from "@/models/profile/avatar.model";

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
  topics: string[] | null;
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
    avatarUrl: avatarHref(row.avatar_path),
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

const threadColumns = `
  id,
  author_id,
  title,
  content,
  visibility,
  topics,
  status,
  created_at,
  updated_at,
  author:profiles!forum_threads_author_id_fkey(
    id,
    full_name,
    username,
    avatar_path
  )
`;

interface CandidateRow {
  id: number;
  author_id: string;
  topics: string[] | null;
  created_at: string;
  upvotes: { count: number }[] | null;
  comments: { count: number }[] | null;
}

function embeddedCount(value: { count: number }[] | null): number {
  return Number(value?.[0]?.count ?? 0);
}

const interestSources = new Set<InterestSource>(["followed", "posted", "commented", "upvoted"]);

export class SupabaseForumRepository implements ForumRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listThreads(input: {
    readonly scope: "latest" | "mine" | "connections";
    readonly viewerId: string;
    readonly limit: number;
    readonly topic: string | null;
    readonly authorIds?: readonly string[];
  }): Promise<ForumThread[]> {
    // Row-level security decides visibility: community posts, the viewer's
    // own posts and posts their study buddies shared with buddies only.
    let query = this.supabase
      .from("forum_threads")
      .select(threadColumns)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(input.limit);

    if (input.scope === "mine") {
      query = query.eq("author_id", input.viewerId);
    } else if (input.scope === "connections") {
      if (!input.authorIds || input.authorIds.length === 0) {
        return [];
      }

      query = query.in("author_id", [...input.authorIds]);
    }

    if (input.topic) {
      query = query.contains("topics", [input.topic]);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to load forum threads: ${error.message}`);
    }

    return this.hydrate((data ?? []) as unknown as ThreadRow[], input.viewerId);
  }

  async listFeedCandidates(input: {
    readonly sinceDays: number;
    readonly limit: number;
    readonly topic: string | null;
  }): Promise<FeedCandidate[]> {
    const since = new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000).toISOString();
    let query = this.supabase
      .from("forum_threads")
      .select(
        "id, author_id, topics, created_at, upvotes:forum_thread_upvotes(count), comments:forum_comments(count)",
      )
      .eq("status", "published")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(input.limit);

    if (input.topic) {
      query = query.contains("topics", [input.topic]);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to load forum feed: ${error.message}`);
    }

    return ((data ?? []) as unknown as CandidateRow[]).map((row) => ({
      id: row.id,
      authorId: row.author_id,
      topics: row.topics ?? [],
      createdAt: row.created_at,
      upvoteCount: embeddedCount(row.upvotes),
      commentCount: embeddedCount(row.comments),
    }));
  }

  async findThreadsByIds(ids: readonly number[], viewerId: string): Promise<ForumThread[]> {
    if (ids.length === 0) {
      return [];
    }

    const { data, error } = await this.supabase
      .from("forum_threads")
      .select(threadColumns)
      .in("id", [...ids])
      .eq("status", "published");

    if (error) {
      throw new Error(`Unable to load forum threads: ${error.message}`);
    }

    const threads = await this.hydrate((data ?? []) as unknown as ThreadRow[], viewerId);
    const byId = new Map(threads.map((thread) => [thread.id, thread]));

    return ids.flatMap((id) => {
      const thread = byId.get(id);
      return thread ? [thread] : [];
    });
  }

  async listStudyBuddyIds(viewerId: string): Promise<string[]> {
    // peer_connections belongs to the study-buddy module; this only reads it.
    const { data, error } = await this.supabase
      .from("peer_connections")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`);

    if (error) {
      throw new Error(`Unable to load study buddies: ${error.message}`);
    }

    return (data as { requester_id: string; addressee_id: string }[]).map((row) =>
      row.requester_id === viewerId ? row.addressee_id : row.requester_id,
    );
  }

  async listInterestSignals(): Promise<InterestSignal[]> {
    const { data, error } = await this.supabase.rpc("my_forum_interest_signals");

    if (error) {
      throw new Error(`Unable to load forum interests: ${error.message}`);
    }

    return ((data ?? []) as { topic: string; source: string; occurred_at: string }[]).flatMap(
      (row) =>
        interestSources.has(row.source as InterestSource)
          ? [
              {
                topic: row.topic,
                source: row.source as InterestSource,
                occurredAt: row.occurred_at,
              },
            ]
          : [],
    );
  }

  async listFollowedTopics(viewerId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("forum_topic_follows")
      .select("topic")
      .eq("user_id", viewerId)
      .order("topic", { ascending: true });

    if (error) {
      throw new Error(`Unable to load followed topics: ${error.message}`);
    }

    return (data as { topic: string }[]).map((row) => row.topic);
  }

  async followTopic(viewerId: string, topic: string): Promise<void> {
    const { error } = await this.supabase
      .from("forum_topic_follows")
      .upsert({ user_id: viewerId, topic }, { onConflict: "user_id,topic", ignoreDuplicates: true });

    if (error) {
      // The insert policy refuses a 31st follow.
      throw new Error(
        error.code === "42501" ? "follow_limit" : `Unable to follow topic: ${error.message}`,
      );
    }
  }

  async unfollowTopic(viewerId: string, topic: string): Promise<void> {
    const { error } = await this.supabase
      .from("forum_topic_follows")
      .delete()
      .eq("user_id", viewerId)
      .eq("topic", topic);

    if (error) {
      throw new Error(`Unable to unfollow topic: ${error.message}`);
    }
  }

  async listPopularTopics(limit: number): Promise<ForumTopicCount[]> {
    const { data, error } = await this.supabase.rpc("forum_popular_topics", { p_limit: limit });

    if (error) {
      throw new Error(`Unable to load popular topics: ${error.message}`);
    }

    return ((data ?? []) as { topic: string; thread_count: number }[]).map((row) => ({
      topic: row.topic,
      threadCount: Number(row.thread_count),
    }));
  }

  /** Loads attachments, comments and upvotes for a page of threads. */
  private async hydrate(rows: readonly ThreadRow[], viewerId: string): Promise<ForumThread[]> {
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
        topics: row.topics ?? [],
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        attachments: attachments
          .filter((attachment) => attachment.thread_id === row.id)
          .map(toAttachment),
        comments: comments
          .filter((comment) => comment.thread_id === row.id)
          .map((comment) => toComment(comment, viewerId)),
        upvoteCount: threadUpvotes.length,
        viewerHasUpvoted: threadUpvotes.some((vote) => vote.user_id === viewerId),
        canDelete: row.author_id === viewerId,
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
        topics: [...input.topics],
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

  async updateThread(input: UpdateForumThreadInput): Promise<boolean> {
    // Row-level security already limits updates to the author; the extra
    // filters keep hidden or removed posts from being edited back into view.
    const { data, error } = await this.supabase
      .from("forum_threads")
      .update({ title: input.title, content: input.content })
      .eq("id", input.threadId)
      .eq("author_id", input.authorId)
      .eq("status", "published")
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to update forum thread: ${error.message}`);
    }

    return data !== null;
  }

  async updateComment(input: UpdateForumCommentInput): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("forum_comments")
      .update({ content: input.content })
      .eq("id", input.commentId)
      .eq("author_id", input.authorId)
      .eq("status", "published")
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to update forum comment: ${error.message}`);
    }

    return data !== null;
  }
}
