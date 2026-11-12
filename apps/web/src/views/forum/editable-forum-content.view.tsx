"use client";

import { useActionState, useState } from "react";

import {
  forumRules,
  type ForumEditFormState,
} from "@/models/forum/forum.model";

export type ForumEditAction = (
  state: ForumEditFormState,
  formData: FormData,
) => Promise<ForumEditFormState>;

interface EditableThreadContentProps {
  readonly threadId: number;
  readonly title: string;
  readonly content: string;
  readonly edited: boolean;
  readonly canEdit: boolean;
  readonly action: ForumEditAction;
}

/**
 * A post's title and body, with an inline editor for its author. Saving
 * changes the post's updatedAt, which the parent uses as this component's
 * key, so a successful save remounts it back in read mode.
 */
export function EditableThreadContent({
  threadId,
  title,
  content,
  edited,
  canEdit,
  action,
}: EditableThreadContentProps) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});

  if (!editing) {
    return (
      <div className="forum-thread-copy">
        <h2>{title}</h2>
        <p>{content}</p>
        <div className="forum-edit-meta">
          {edited ? <span className="forum-edited">Edited</span> : null}
          {canEdit ? (
            <button className="forum-edit-button" type="button" onClick={() => setEditing(true)}>
              Edit post
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form className="forum-edit-form" action={formAction}>
      <input type="hidden" name="threadId" value={threadId} />
      <label htmlFor={`edit-title-${threadId}`}>Title</label>
      <input
        id={`edit-title-${threadId}`}
        name="title"
        defaultValue={title}
        minLength={forumRules.titleMinLength}
        maxLength={forumRules.titleMaxLength}
        required
      />
      {state.fieldErrors?.title ? <p className="field-error">{state.fieldErrors.title}</p> : null}
      <label htmlFor={`edit-content-${threadId}`}>Post</label>
      <textarea
        id={`edit-content-${threadId}`}
        name="content"
        rows={6}
        defaultValue={content}
        minLength={forumRules.contentMinLength}
        maxLength={forumRules.contentMaxLength}
        required
      />
      {state.fieldErrors?.content ? <p className="field-error">{state.fieldErrors.content}</p> : null}
      {state.error ? <p className="field-error" role="alert">{state.error}</p> : null}
      <p className="field-hint">Attachments stay as they are. Delete and repost to change them.</p>
      <div className="forum-edit-actions">
        <button className="button button-dark" type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save changes"}
        </button>
        <button className="button button-outline" type="button" onClick={() => setEditing(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface EditableCommentContentProps {
  readonly commentId: number;
  readonly content: string;
  readonly edited: boolean;
  readonly canEdit: boolean;
  readonly action: ForumEditAction;
}

/** A comment's text, with an inline editor for its author. */
export function EditableCommentContent({
  commentId,
  content,
  edited,
  canEdit,
  action,
}: EditableCommentContentProps) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});

  if (!editing) {
    return (
      <>
        <p>{content}</p>
        {edited || canEdit ? (
          <div className="forum-edit-meta">
            {edited ? <span className="forum-edited">Edited</span> : null}
            {canEdit ? (
              <button className="forum-edit-button" type="button" onClick={() => setEditing(true)}>
                Edit
              </button>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <form className="forum-edit-form compact" action={formAction}>
      <input type="hidden" name="commentId" value={commentId} />
      <label className="visually-hidden" htmlFor={`edit-comment-${commentId}`}>Edit comment</label>
      <textarea
        id={`edit-comment-${commentId}`}
        name="content"
        rows={3}
        defaultValue={content}
        maxLength={forumRules.commentMaxLength}
        required
      />
      {state.fieldErrors?.content ? <p className="field-error">{state.fieldErrors.content}</p> : null}
      {state.error ? <p className="field-error" role="alert">{state.error}</p> : null}
      <div className="forum-edit-actions">
        <button className="button button-dark" type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </button>
        <button className="button button-outline" type="button" onClick={() => setEditing(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
