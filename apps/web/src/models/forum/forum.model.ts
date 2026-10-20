export const forumFeedScopes = ["community", "connections", "mine"] as const;

export type ForumFeedScope = (typeof forumFeedScopes)[number];
export type ForumVisibility = "community" | "connections";
export type ForumContentStatus = "published" | "hidden" | "deleted";

export interface ForumAuthor {
  readonly id: string;
  readonly displayName: string;
  readonly username: string | null;
  readonly avatarPath: string | null;
  readonly initials: string;
}

export interface ForumAttachment {
  readonly id: number;
  readonly threadId: number;
  readonly storagePath: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly position: number;
  readonly url: string | null;
}

export interface ForumComment {
  readonly id: number;
  readonly threadId: number;
  readonly author: ForumAuthor;
  readonly parentCommentId: number | null;
  readonly content: string;
  readonly status: ForumContentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly canDelete: boolean;
}

export interface ForumThread {
  readonly id: number;
  readonly author: ForumAuthor;
  readonly title: string;
  readonly content: string;
  readonly visibility: ForumVisibility;
  readonly status: ForumContentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly ForumAttachment[];
  readonly comments: readonly ForumComment[];
  readonly upvoteCount: number;
  readonly viewerHasUpvoted: boolean;
  readonly canDelete: boolean;
}

export interface CreateForumThreadInput {
  readonly authorId: string;
  readonly title: string;
  readonly content: string;
  readonly visibility: ForumVisibility;
}

export interface CreateForumAttachmentInput {
  readonly threadId: number;
  readonly uploaderId: string;
  readonly storagePath: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly position: number;
}

export interface CreateForumCommentInput {
  readonly threadId: number;
  readonly authorId: string;
  readonly content: string;
  readonly parentCommentId?: number | null;
}

export interface ForumThreadFormValues {
  readonly title: string;
  readonly content: string;
}

export interface ForumThreadFormState {
  readonly error?: string;
  readonly notice?: string;
  readonly fieldErrors?: Partial<Record<"title" | "content" | "attachments", string>>;
  readonly values?: ForumThreadFormValues;
}

export interface ForumCommentFormState {
  readonly error?: string;
  readonly notice?: string;
  readonly value?: string;
}

export const forumRules = {
  titleMinLength: 5,
  titleMaxLength: 160,
  contentMinLength: 10,
  contentMaxLength: 5000,
  commentMaxLength: 1500,
  maxAttachments: 4,
  maxAttachmentBytes: 10 * 1024 * 1024,
  maxCombinedAttachmentBytes: 25 * 1024 * 1024,
  allowedAttachmentTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
} as const;

const allowedAttachmentTypes = new Set<string>(forumRules.allowedAttachmentTypes);

export function parseForumFeedScope(value: string | string[] | undefined): ForumFeedScope {
  const candidate = Array.isArray(value) ? value[0] : value;

  return forumFeedScopes.includes(candidate as ForumFeedScope)
    ? (candidate as ForumFeedScope)
    : "community";
}

export function createInitials(displayName: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "ST";
}

export function isImageAttachment(attachment: ForumAttachment): boolean {
  return attachment.mimeType.startsWith("image/");
}

export type ForumThreadValidationResult =
  | {
      readonly ok: true;
      readonly value: ForumThreadFormValues;
      readonly attachments: readonly File[];
    }
  | {
      readonly ok: false;
      readonly fieldErrors: ForumThreadFormState["fieldErrors"];
    };

export function validateForumThread(
  values: ForumThreadFormValues,
  attachments: readonly File[],
): ForumThreadValidationResult {
  const title = values.title.trim();
  const content = values.content.trim();
  const fieldErrors: NonNullable<ForumThreadFormState["fieldErrors"]> = {};

  if (
    title.length < forumRules.titleMinLength ||
    title.length > forumRules.titleMaxLength
  ) {
    fieldErrors.title = `Title must be ${forumRules.titleMinLength}–${forumRules.titleMaxLength} characters.`;
  }

  if (
    content.length < forumRules.contentMinLength ||
    content.length > forumRules.contentMaxLength
  ) {
    fieldErrors.content = `Post must be ${forumRules.contentMinLength}–${forumRules.contentMaxLength} characters.`;
  }

  if (attachments.length > forumRules.maxAttachments) {
    fieldErrors.attachments = `Attach no more than ${forumRules.maxAttachments} files.`;
  } else {
    const unsupported = attachments.find(
      (file) => !allowedAttachmentTypes.has(file.type),
    );
    const oversized = attachments.find(
      (file) => file.size > forumRules.maxAttachmentBytes,
    );
    const totalBytes = attachments.reduce((total, file) => total + file.size, 0);

    if (unsupported) {
      fieldErrors.attachments =
        "Attachments must be JPEG, PNG, WebP, PDF or DOCX files.";
    } else if (oversized) {
      fieldErrors.attachments = "Each attachment must be 10 MB or smaller.";
    } else if (totalBytes > forumRules.maxCombinedAttachmentBytes) {
      fieldErrors.attachments = "Combined attachments must be 25 MB or smaller.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return { ok: true, value: { title, content }, attachments };
}

export function validateForumComment(content: string): string | null {
  const value = content.trim();

  if (!value) {
    return "Write a comment before posting.";
  }

  if (value.length > forumRules.commentMaxLength) {
    return `Comment must be ${forumRules.commentMaxLength} characters or fewer.`;
  }

  return null;
}
