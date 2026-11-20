"use client";

import { useState, type KeyboardEvent } from "react";

import { forumRules, normalizeForumTopic } from "@/models/forum/forum.model";

interface ForumTopicInputProps {
  readonly id: string;
  readonly defaultTopics: readonly string[];
  /** Popular topics offered as one-click suggestions. */
  readonly suggestions: readonly string[];
  readonly invalid: boolean;
  readonly describedBy?: string;
}

/**
 * Topic chips for a new post. Typing a topic and pressing Enter or a comma
 * adds it; popular topics can be added with one click so the same subject is
 * not spelled in many ways. Each chosen topic is submitted as a "topics" field.
 */
export function ForumTopicInput({
  id,
  defaultTopics,
  suggestions,
  invalid,
  describedBy,
}: ForumTopicInputProps) {
  const [topics, setTopics] = useState<string[]>(() =>
    defaultTopics.flatMap((topic) => normalizeForumTopic(topic) ?? []).slice(0, forumRules.maxTopics),
  );
  const [draft, setDraft] = useState("");
  const full = topics.length >= forumRules.maxTopics;
  const typed = normalizeForumTopic(draft);
  const offered = suggestions
    .filter((topic) => !topics.includes(topic))
    .filter((topic) => (typed ? topic.includes(typed) : true))
    .slice(0, 8);

  function add(raw: string) {
    const topic = normalizeForumTopic(raw);

    if (topic && !topics.includes(topic) && !full) {
      setTopics([...topics, topic]);
    }

    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && draft === "" && topics.length > 0) {
      setTopics(topics.slice(0, -1));
    }
  }

  return (
    <div className="forum-topic-input">
      <div className={`forum-topic-box${invalid ? " invalid" : ""}`}>
        {topics.map((topic) => (
          <span className="forum-topic-chip" key={topic}>
            #{topic}
            <input type="hidden" name="topics" value={topic} />
            <button
              type="button"
              aria-label={`Remove topic ${topic}`}
              onClick={() => setTopics(topics.filter((item) => item !== topic))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => (draft.trim() ? add(draft) : undefined)}
          maxLength={forumRules.topicMaxLength + 5}
          placeholder={full ? "Topic limit reached" : topics.length ? "Add another…" : "e.g. databases"}
          disabled={full}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
      </div>

      {offered.length > 0 && !full ? (
        <div className="forum-topic-suggestions" aria-label="Suggested topics">
          <span>{typed ? "Matching" : "Popular"}:</span>
          {offered.map((topic) => (
            <button type="button" key={topic} onClick={() => add(topic)}>
              +{topic}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
