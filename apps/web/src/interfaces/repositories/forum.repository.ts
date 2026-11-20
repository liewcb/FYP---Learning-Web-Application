import type {
  CreateForumAttachmentInput,
  CreateForumCommentInput,
  CreateForumThreadInput,
  ForumThread,
  ForumTopicCount,
  UpdateForumCommentInput,
  UpdateForumThreadInput,
} from "@/models/forum/forum.model";
import type { FeedCandidate, InterestSignal } from "@/models/forum/forum-feed.model";

export interface ForumRepository {
  /** Newest first. Row-level security decides which posts the viewer may see. */
  listThreads(input: {
    readonly scope: "latest" | "mine" | "connections";
    readonly viewerId: string;
    readonly limit: number;
    readonly topic: string | null;
    /** Required for "connections": the viewer's study buddies. */
    readonly authorIds?: readonly string[];
  }): Promise<ForumThread[]>;
  /** Recent visible posts with their counts, for the "For you" ranking. */
  listFeedCandidates(input: {
    readonly sinceDays: number;
    readonly limit: number;
    readonly topic: string | null;
  }): Promise<FeedCandidate[]>;
  /** Fully loaded posts in the order of `ids`. */
  findThreadsByIds(ids: readonly number[], viewerId: string): Promise<ForumThread[]>;
  /** Accepted study buddies (read from the study-buddy module). */
  listStudyBuddyIds(viewerId: string): Promise<string[]>;
  listInterestSignals(): Promise<InterestSignal[]>;
  listFollowedTopics(viewerId: string): Promise<string[]>;
  /** Throws Error("follow_limit") after the maximum number of follows. */
  followTopic(viewerId: string, topic: string): Promise<void>;
  unfollowTopic(viewerId: string, topic: string): Promise<void>;
  listPopularTopics(limit: number): Promise<ForumTopicCount[]>;
  createThread(input: CreateForumThreadInput): Promise<number>;
  createAttachment(input: CreateForumAttachmentInput): Promise<void>;
  listAttachmentPaths(threadId: number): Promise<string[]>;
  deleteThread(threadId: number): Promise<void>;
  createComment(input: CreateForumCommentInput): Promise<void>;
  deleteComment(commentId: number): Promise<void>;
  toggleUpvote(threadId: number, userId: string): Promise<void>;
  /** Updates the author's own published post; false when it was not theirs or not editable. */
  updateThread(input: UpdateForumThreadInput): Promise<boolean>;
  updateComment(input: UpdateForumCommentInput): Promise<boolean>;
}
