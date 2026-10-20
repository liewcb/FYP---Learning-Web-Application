"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  forumRules,
  type ForumCommentFormState,
} from "@/models/forum/forum.model";

interface CommentFormViewProps {
  readonly threadId: number;
  readonly action: (
    state: ForumCommentFormState,
    formData: FormData,
  ) => Promise<ForumCommentFormState>;
}

export function CommentFormView({ threadId, action }: CommentFormViewProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.notice) {
      formRef.current?.reset();
    }
  }, [state.notice]);

  return (
    <form ref={formRef} className="forum-comment-form" action={formAction}>
      <input type="hidden" name="threadId" value={threadId} />
      <label className="visually-hidden" htmlFor={`comment-${threadId}`}>
        Add a comment
      </label>
      <textarea
        id={`comment-${threadId}`}
        name="content"
        defaultValue={state.value ?? ""}
        maxLength={forumRules.commentMaxLength}
        placeholder="Add a helpful comment..."
        aria-invalid={Boolean(state.error)}
        required
      />
      <button className="button button-dark" type="submit" disabled={pending}>
        {pending ? "Posting..." : "Post comment"}
      </button>
      {state.error ? <span className="field-error">{state.error}</span> : null}
      {state.notice ? (
        <span className="field-hint success" role="status">{state.notice}</span>
      ) : null}
    </form>
  );
}
