"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  forumRules,
  type ForumThreadFormState,
} from "@/models/forum/forum.model";

interface CreateThreadViewProps {
  readonly action: (
    state: ForumThreadFormState,
    formData: FormData,
  ) => Promise<ForumThreadFormState>;
}

export function CreateThreadView({ action }: CreateThreadViewProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.notice) {
      formRef.current?.reset();
    }
  }, [state.notice]);

  return (
    <form
      ref={formRef}
      className="module-card forum-compose"
      action={formAction}
      noValidate
    >
      <div className="module-card-heading">
        <span className="module-icon amber" aria-hidden="true">✎</span>
        <div>
          <h2>New post</h2>
        </div>
      </div>

      <p className="module-card-copy">
        Visible to every signed-in student.
      </p>

      {state.error ? (
        <p className="form-alert" role="alert">{state.error}</p>
      ) : null}
      {state.notice ? (
        <p className="form-notice" role="status">{state.notice}</p>
      ) : null}

      <div className="form-field">
        <label htmlFor="forum-title">Discussion title</label>
        <input
          id="forum-title"
          name="title"
          defaultValue={state.values?.title ?? ""}
          maxLength={forumRules.titleMaxLength}
          aria-invalid={Boolean(state.fieldErrors?.title)}
          placeholder="e.g. How does input validation prevent SQL injection?"
          required
        />
        {state.fieldErrors?.title ? (
          <span className="field-error">{state.fieldErrors.title}</span>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="forum-content">Question or explanation</label>
        <textarea
          id="forum-content"
          name="content"
          defaultValue={state.values?.content ?? ""}
          maxLength={forumRules.contentMaxLength}
          aria-invalid={Boolean(state.fieldErrors?.content)}
          placeholder="Explain what you understand, where you are stuck, or what you want classmates to discuss."
          required
        />
        {state.fieldErrors?.content ? (
          <span className="field-error">{state.fieldErrors.content}</span>
        ) : null}
      </div>

      <label className="upload-picker forum-attachment-picker" htmlFor="forum-attachments">
        <span className="upload-picker-icon" aria-hidden="true">＋</span>
        <span>
          <strong>Add supporting files</strong>
          <small>Up to 4 images, PDF or DOCX files · 10 MB each</small>
        </span>
        <input
          id="forum-attachments"
          name="attachments"
          type="file"
          accept="image/jpeg,image/png,image/webp,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
        />
      </label>
      {state.fieldErrors?.attachments ? (
        <span className="field-error">{state.fieldErrors.attachments}</span>
      ) : null}

      <button className="button button-dark" type="submit" disabled={pending}>
        {pending ? "Publishing..." : "Publish discussion"}
      </button>
    </form>
  );
}
