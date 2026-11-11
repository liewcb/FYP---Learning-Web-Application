import type {
  ForumCommentFormState,
  ForumThread,
} from "@/models/forum/forum.model";
import { isImageAttachment } from "@/models/forum/forum.model";
import { CommentFormView } from "@/views/forum/comment-form.view";
import {
  ReportContentView,
  type ForumReportAction,
} from "@/views/forum/report-content.view";
import { ConfirmSubmitButton } from "@/views/shared/confirm-submit-button.view";

interface ForumThreadViewProps {
  readonly thread: ForumThread;
  readonly addCommentAction: (
    state: ForumCommentFormState,
    formData: FormData,
  ) => Promise<ForumCommentFormState>;
  readonly toggleUpvoteAction: (formData: FormData) => Promise<void>;
  readonly deleteThreadAction: (formData: FormData) => Promise<void>;
  readonly deleteCommentAction: (formData: FormData) => Promise<void>;
  readonly reportAction: ForumReportAction;
}

const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ForumThreadView({
  thread,
  addCommentAction,
  toggleUpvoteAction,
  deleteThreadAction,
  deleteCommentAction,
  reportAction,
}: ForumThreadViewProps) {
  return (
    <article className="forum-thread">
      <header className="forum-thread-header">
        <span className="forum-avatar" aria-hidden="true">{thread.author.initials}</span>
        <div>
          <strong>{thread.author.displayName}</strong>
          <p>
            {thread.author.username ? `@${thread.author.username} · ` : ""}
            {dateFormatter.format(new Date(thread.createdAt))}
          </p>
        </div>
        <span className="status-chip uploaded">Community</span>
      </header>

      <div className="forum-thread-copy">
        <h2>{thread.title}</h2>
        <p>{thread.content}</p>
      </div>

      {thread.attachments.length > 0 ? (
        <div className="forum-attachments">
          {thread.attachments.map((attachment) =>
            attachment.url && isImageAttachment(attachment) ? (
              <a
                className="forum-image-link"
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                key={attachment.id}
              >
                {/* Signed Supabase URLs have a dynamic host and short lifetime. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.url} alt={attachment.fileName} />
              </a>
            ) : (
              <a
                className="forum-file-link"
                href={attachment.url ?? undefined}
                aria-disabled={!attachment.url}
                target="_blank"
                rel="noreferrer"
                key={attachment.id}
              >
                <span aria-hidden="true">▤</span>
                <span>
                  <strong>{attachment.fileName}</strong>
                  <small>{formatBytes(attachment.sizeBytes)}</small>
                </span>
              </a>
            ),
          )}
        </div>
      ) : null}

      <div className="forum-thread-actions">
        <form action={toggleUpvoteAction}>
          <input type="hidden" name="threadId" value={thread.id} />
          <button
            className={thread.viewerHasUpvoted ? "forum-action active" : "forum-action"}
            type="submit"
            aria-pressed={thread.viewerHasUpvoted}
          >
            <span aria-hidden="true">▲</span>
            {thread.upvoteCount} {thread.upvoteCount === 1 ? "upvote" : "upvotes"}
          </button>
        </form>
        <span className="forum-action static">
          <span aria-hidden="true">◯</span>
          {thread.comments.length} {thread.comments.length === 1 ? "comment" : "comments"}
        </span>
        {thread.canDelete ? (
          <form className="forum-delete-form" action={deleteThreadAction}>
            <input type="hidden" name="threadId" value={thread.id} />
            <ConfirmSubmitButton
              className="forum-delete-button"
              message="Delete this discussion and all of its comments?"
            >
              Delete post
            </ConfirmSubmitButton>
          </form>
        ) : (
          <ReportContentView action={reportAction} threadId={thread.id} />
        )}
      </div>

      <details className="forum-comment-section" open={thread.comments.length > 0}>
        <summary>Discussion ({thread.comments.length})</summary>
        <div className="forum-comments">
          {thread.comments.length > 0 ? (
            thread.comments.map((comment) => (
              <div className="forum-comment" key={comment.id}>
                <span className="forum-avatar small" aria-hidden="true">
                  {comment.author.initials}
                </span>
                <div>
                  <div className="forum-comment-heading">
                    <strong>{comment.author.displayName}</strong>
                    <span>{dateFormatter.format(new Date(comment.createdAt))}</span>
                    {comment.canDelete ? (
                      <form action={deleteCommentAction}>
                        <input type="hidden" name="commentId" value={comment.id} />
                        <ConfirmSubmitButton
                          className="forum-comment-delete"
                          message="Delete this comment?"
                        >
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    ) : (
                      <ReportContentView action={reportAction} commentId={comment.id} />
                    )}
                  </div>
                  <p>{comment.content}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="forum-no-comments">No comments yet. Start the discussion.</p>
          )}
        </div>
        <CommentFormView threadId={thread.id} action={addCommentAction} />
      </details>
    </article>
  );
}
