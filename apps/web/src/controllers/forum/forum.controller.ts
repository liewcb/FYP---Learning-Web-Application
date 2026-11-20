import type { ForumRepository } from "@/interfaces/repositories/forum.repository";
import type { ForumAttachmentStorage } from "@/interfaces/services/forum-attachment-storage.interface";
import {
  buildInterestProfile,
  rankFeed,
} from "@/models/forum/forum-feed.model";
import {
  forumRules,
  isForumVisibility,
  normalizeForumTopic,
  validateForumComment,
  validateForumThread,
  validateForumThreadEdit,
  validateForumTopics,
  type ForumCommentFormState,
  type ForumEditFormState,
  type ForumFeedContext,
  type ForumFeedScope,
  type ForumNewThreadValues,
  type ForumThread,
  type ForumThreadFormState,
  type ForumThreadFormValues,
  type ForumTopicFollowState,
} from "@/models/forum/forum.model";

const forumPageSize = 20;
/** "For you" ranks recent posts only; older ones stay under Latest. */
const feedWindowDays = 30;
const feedCandidateLimit = 200;
const popularTopicLimit = 12;

export class ForumController {
  constructor(
    private readonly forum: ForumRepository,
    private readonly storage: ForumAttachmentStorage,
  ) {}

  async list(input: {
    readonly scope: ForumFeedScope;
    readonly viewerId: string;
    readonly topic: string | null;
  }): Promise<ForumThread[]> {
    const { scope, viewerId, topic } = input;
    let threads: ForumThread[];

    if (scope === "for_you") {
      threads = await this.forYou(viewerId, topic);
    } else if (scope === "connections") {
      const buddyIds = await this.forum.listStudyBuddyIds(viewerId);
      threads = await this.forum.listThreads({
        scope,
        viewerId,
        limit: forumPageSize,
        topic,
        authorIds: buddyIds,
      });
    } else {
      threads = await this.forum.listThreads({ scope, viewerId, limit: forumPageSize, topic });
    }

    return this.signAttachments(threads);
  }

  /** Followed topics, popular topics and buddy count for the side panel. */
  async feedContext(viewerId: string): Promise<ForumFeedContext> {
    const [followedTopics, popularTopics, buddyIds] = await Promise.all([
      this.forum.listFollowedTopics(viewerId),
      this.forum.listPopularTopics(popularTopicLimit),
      this.forum.listStudyBuddyIds(viewerId),
    ]);

    return { followedTopics, popularTopics, buddyCount: buddyIds.length };
  }

  async followTopic(viewerId: string, rawTopic: string): Promise<ForumTopicFollowState> {
    const topic = normalizeForumTopic(rawTopic);

    if (!topic) {
      return { error: "Choose a topic to follow." };
    }

    try {
      await this.forum.followTopic(viewerId, topic);
      return {};
    } catch (error) {
      if (error instanceof Error && error.message === "follow_limit") {
        return {
          error: `You can follow up to ${forumRules.maxFollowedTopics} topics. Unfollow one first.`,
        };
      }

      console.error("Following a forum topic failed.", error);
      return { error: "The topic could not be followed. Please try again." };
    }
  }

  async unfollowTopic(viewerId: string, rawTopic: string): Promise<void> {
    const topic = normalizeForumTopic(rawTopic);

    if (topic) {
      await this.forum.unfollowTopic(viewerId, topic);
    }
  }

  /**
   * Ranks recent posts with the model in forum-feed.model.ts, then loads only
   * the posts that made the page, each with the reason it was chosen.
   */
  private async forYou(viewerId: string, topic: string | null): Promise<ForumThread[]> {
    const [candidates, signals, buddyIds, followedTopics] = await Promise.all([
      this.forum.listFeedCandidates({
        sinceDays: feedWindowDays,
        limit: feedCandidateLimit,
        topic,
      }),
      this.forum.listInterestSignals(),
      this.forum.listStudyBuddyIds(viewerId),
      this.forum.listFollowedTopics(viewerId),
    ]);
    const now = new Date();
    const ranked = rankFeed(
      candidates,
      {
        viewerId,
        buddyIds: new Set(buddyIds),
        followedTopics: new Set(followedTopics),
        interests: buildInterestProfile(signals, now),
        now,
      },
      forumPageSize,
    );
    const threads = await this.forum.findThreadsByIds(
      ranked.map((item) => item.candidate.id),
      viewerId,
    );
    const reasons = new Map(ranked.map((item) => [item.candidate.id, item.reason]));

    return threads.map((thread) => ({ ...thread, feedReason: reasons.get(thread.id) }));
  }

  private signAttachments(threads: readonly ForumThread[]): Promise<ForumThread[]> {
    return Promise.all(
      threads.map(async (thread) => ({
        ...thread,
        attachments: await Promise.all(
          thread.attachments.map(async (attachment) => {
            try {
              return {
                ...attachment,
                url: await this.storage.createSignedUrl(attachment.storagePath),
              };
            } catch (error) {
              console.error("Forum attachment signing failed.", error);
              return attachment;
            }
          }),
        ),
      })),
    );
  }

  async createThread(input: {
    readonly authorId: string;
    readonly values: ForumNewThreadValues;
    readonly attachments: readonly File[];
  }): Promise<ForumThreadFormState> {
    const validation = validateForumThread(input.values, input.attachments);
    const topics = validateForumTopics(input.values.topics);
    const visibility = isForumVisibility(input.values.visibility)
      ? input.values.visibility
      : null;

    if (!validation.ok || !topics.ok || visibility === null) {
      return {
        fieldErrors: {
          ...(validation.ok ? {} : validation.fieldErrors),
          ...(topics.ok ? {} : { topics: topics.error }),
          ...(visibility === null ? { visibility: "Choose who can see this post." } : {}),
        },
        values: input.values,
      };
    }

    let threadId: number | null = null;
    const storedPaths: string[] = [];

    try {
      threadId = await this.forum.createThread({
        authorId: input.authorId,
        title: validation.value.title,
        content: validation.value.content,
        visibility,
        topics: topics.topics,
      });

      for (const [position, file] of validation.attachments.entries()) {
        const stored = await this.storage.upload({
          ownerId: input.authorId,
          threadId,
          fileName: file.name,
          mimeType: file.type,
          body: file,
        });
        storedPaths.push(stored.path);

        await this.forum.createAttachment({
          threadId,
          uploaderId: input.authorId,
          storagePath: stored.path,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          position,
        });
      }

      return {
        notice:
          visibility === "connections"
            ? "Your post is published for your study buddies."
            : "Your discussion thread has been published.",
        postedAt: Date.now(),
      };
    } catch (error) {
      if (storedPaths.length > 0) {
        try {
          await this.storage.remove(storedPaths);
        } catch (cleanupError) {
          console.error("Forum attachment cleanup failed.", cleanupError);
        }
      }

      if (threadId !== null) {
        try {
          await this.forum.deleteThread(threadId);
        } catch (cleanupError) {
          console.error("Forum thread cleanup failed.", cleanupError);
        }
      }

      console.error("Forum thread creation failed.", error);
      return {
        error: "The discussion could not be published. Please try again.",
        values: input.values,
      };
    }
  }

  async addComment(input: {
    readonly threadId: number;
    readonly authorId: string;
    readonly content: string;
  }): Promise<ForumCommentFormState> {
    const error = validateForumComment(input.content);

    if (error) {
      return { error, value: input.content };
    }

    try {
      await this.forum.createComment({
        threadId: input.threadId,
        authorId: input.authorId,
        content: input.content.trim(),
      });
      return { notice: "Comment posted." };
    } catch (commentError) {
      console.error("Forum comment creation failed.", commentError);
      return {
        error: "The comment could not be posted. Please try again.",
        value: input.content,
      };
    }
  }

  toggleUpvote(threadId: number, viewerId: string): Promise<void> {
    return this.forum.toggleUpvote(threadId, viewerId);
  }

  async deleteThread(threadId: number): Promise<void> {
    const paths = await this.forum.listAttachmentPaths(threadId);
    await this.forum.deleteThread(threadId);

    try {
      await this.storage.remove(paths);
    } catch (error) {
      // The database post is already gone. Keep the user-facing delete
      // successful and leave the orphan for administrative cleanup.
      console.error("Deleted thread attachment cleanup failed.", error);
    }
  }

  deleteComment(commentId: number): Promise<void> {
    return this.forum.deleteComment(commentId);
  }

  async editThread(input: {
    readonly threadId: number;
    readonly authorId: string;
    readonly values: ForumThreadFormValues;
  }): Promise<ForumEditFormState> {
    const validation = validateForumThreadEdit(input.values);

    if (!validation.ok) {
      return { fieldErrors: validation.fieldErrors };
    }

    try {
      const updated = await this.forum.updateThread({
        threadId: input.threadId,
        authorId: input.authorId,
        ...validation.value,
      });

      return updated
        ? { notice: "Post updated." }
        : { error: "This post can no longer be edited." };
    } catch (error) {
      console.error("Forum thread update failed.", error);
      return { error: "Your changes could not be saved. Please try again." };
    }
  }

  async editComment(input: {
    readonly commentId: number;
    readonly authorId: string;
    readonly content: string;
  }): Promise<ForumEditFormState> {
    const invalid = validateForumComment(input.content);

    if (invalid) {
      return { fieldErrors: { content: invalid } };
    }

    try {
      const updated = await this.forum.updateComment({
        commentId: input.commentId,
        authorId: input.authorId,
        content: input.content.trim(),
      });

      return updated
        ? { notice: "Comment updated." }
        : { error: "This comment can no longer be edited." };
    } catch (error) {
      console.error("Forum comment update failed.", error);
      return { error: "Your changes could not be saved. Please try again." };
    }
  }
}
