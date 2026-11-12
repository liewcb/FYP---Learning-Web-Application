import type { ForumRepository } from "@/interfaces/repositories/forum.repository";
import type { ForumAttachmentStorage } from "@/interfaces/services/forum-attachment-storage.interface";
import {
  validateForumComment,
  validateForumThread,
  validateForumThreadEdit,
  type ForumCommentFormState,
  type ForumEditFormState,
  type ForumFeedScope,
  type ForumThread,
  type ForumThreadFormState,
  type ForumThreadFormValues,
} from "@/models/forum/forum.model";

const forumPageSize = 20;

export class ForumController {
  constructor(
    private readonly forum: ForumRepository,
    private readonly storage: ForumAttachmentStorage,
  ) {}

  async list(scope: ForumFeedScope, viewerId: string): Promise<ForumThread[]> {
    // The connection table belongs to the peer-connection module. Keeping this
    // branch here lets that repository filter be added without changing the UI.
    if (scope === "connections") {
      return [];
    }

    const threads = await this.forum.listThreads({
      scope,
      viewerId,
      limit: forumPageSize,
    });

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
    readonly values: ForumThreadFormValues;
    readonly attachments: readonly File[];
  }): Promise<ForumThreadFormState> {
    const validation = validateForumThread(input.values, input.attachments);

    if (!validation.ok) {
      return { fieldErrors: validation.fieldErrors, values: input.values };
    }

    let threadId: number | null = null;
    const storedPaths: string[] = [];

    try {
      threadId = await this.forum.createThread({
        authorId: input.authorId,
        title: validation.value.title,
        content: validation.value.content,
        // Community is the report-aligned default. The connection option will
        // be exposed after the peer-connection module supplies its table.
        visibility: "community",
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

      return { notice: "Your discussion thread has been published." };
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
