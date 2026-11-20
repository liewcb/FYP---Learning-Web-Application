"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  forumRules,
  forumVisibilityLabels,
  type ForumThreadFormState,
} from "@/models/forum/forum.model";
import { ForumAttachmentPicker } from "@/views/forum/forum-attachment-picker.view";
import { ForumTopicInput } from "@/views/forum/forum-topic-input.view";

interface CreateThreadViewProps {
  readonly action: (
    state: ForumThreadFormState,
    formData: FormData,
  ) => Promise<ForumThreadFormState>;
  readonly topicSuggestions: readonly string[];
  /** Topic being browsed, pre-filled on a new post. */
  readonly currentTopic: string | null;
  readonly hasStudyBuddies: boolean;
}

export function CreateThreadView({
  action,
  topicSuggestions,
  currentTopic,
  hasStudyBuddies,
}: CreateThreadViewProps) {
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
        Add topics so the right classmates see your post.
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

      <div className="form-field">
        <label htmlFor="forum-topics">Topics</label>
        <ForumTopicInput
          // A fresh input after each successful post; kept after an error.
          key={state.postedAt ?? "new"}
          id="forum-topics"
          defaultTopics={state.values?.topics ?? (currentTopic ? [currentTopic] : [])}
          suggestions={topicSuggestions}
          invalid={Boolean(state.fieldErrors?.topics)}
          describedBy="forum-topics-hint"
        />
        {state.fieldErrors?.topics ? (
          <span className="field-error">{state.fieldErrors.topics}</span>
        ) : (
          <span className="field-hint" id="forum-topics-hint">
            1–{forumRules.maxTopics} topics. Press Enter after each one.
          </span>
        )}
      </div>

      <fieldset className="forum-audience" key={`audience-${state.postedAt ?? "new"}`}>
        <legend>Who can see this</legend>
        <label>
          <input
            type="radio"
            name="visibility"
            value="community"
            defaultChecked={state.values?.visibility !== "connections"}
          />
          <span>
            <strong>{forumVisibilityLabels.community}</strong>
            <small>Every signed-in student</small>
          </span>
        </label>
        <label aria-disabled={!hasStudyBuddies}>
          <input
            type="radio"
            name="visibility"
            value="connections"
            defaultChecked={state.values?.visibility === "connections"}
            disabled={!hasStudyBuddies}
          />
          <span>
            <strong>{forumVisibilityLabels.connections}</strong>
            <small>
              {hasStudyBuddies
                ? "Only students you are connected with"
                : "Connect with a study buddy to use this"}
            </small>
          </span>
        </label>
        {state.fieldErrors?.visibility ? (
          <span className="field-error">{state.fieldErrors.visibility}</span>
        ) : null}
      </fieldset>

      <ForumAttachmentPicker key={`files-${state.postedAt ?? "new"}`} />
      {state.fieldErrors?.attachments ? (
        <span className="field-error">{state.fieldErrors.attachments}</span>
      ) : null}

      <button className="button button-dark" type="submit" disabled={pending}>
        {pending ? "Publishing..." : "Publish discussion"}
      </button>
    </form>
  );
}
