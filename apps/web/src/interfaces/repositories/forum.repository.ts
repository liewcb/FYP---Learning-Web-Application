import type {
  CreateForumAttachmentInput,
  CreateForumCommentInput,
  CreateForumThreadInput,
  ForumFeedScope,
  ForumThread,
  UpdateForumCommentInput,
  UpdateForumThreadInput,
} from "@/models/forum/forum.model";

export interface ForumRepository {
  listThreads(input: {
    readonly scope: Exclude<ForumFeedScope, "connections">;
    readonly viewerId: string;
    readonly limit: number;
  }): Promise<ForumThread[]>;
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
