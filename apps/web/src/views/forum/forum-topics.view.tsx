"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  forumHref,
  type ForumFeedScope,
  type ForumTopicCount,
  type ForumTopicFollowState,
} from "@/models/forum/forum.model";

export type ForumFollowTopicAction = (
  state: ForumTopicFollowState,
  formData: FormData,
) => Promise<ForumTopicFollowState>;

interface ForumTopicsViewProps {
  readonly scope: ForumFeedScope;
  readonly activeTopic: string | null;
  readonly followedTopics: readonly string[];
  readonly popularTopics: readonly ForumTopicCount[];
  readonly followAction: ForumFollowTopicAction;
  readonly unfollowAction: (formData: FormData) => Promise<void>;
}

/** Topic filter, followed topics and popular topics above the feed. */
export function ForumTopicsView({
  scope,
  activeTopic,
  followedTopics,
  popularTopics,
  followAction,
  unfollowAction,
}: ForumTopicsViewProps) {
  const [state, formAction, pending] = useActionState(followAction, {});
  const followed = new Set(followedTopics);
  const popular = popularTopics.filter((item) => !followed.has(item.topic));

  function followButton(topic: string, label: string) {
    return (
      <form action={formAction}>
        <input type="hidden" name="topic" value={topic} />
        <button
          className="forum-follow-button"
          type="submit"
          disabled={pending}
          aria-label={`Follow ${topic}`}
        >
          {label}
        </button>
      </form>
    );
  }

  function unfollowButton(topic: string, label: string, className: string) {
    return (
      <form action={unfollowAction}>
        <input type="hidden" name="topic" value={topic} />
        <button className={className} type="submit" aria-label={`Unfollow ${topic}`}>
          {label}
        </button>
      </form>
    );
  }

  return (
    <section className="forum-topics" aria-label="Topics">
      {activeTopic ? (
        <div className="forum-topic-active">
          <div>
            <span className="section-kicker">Topic</span>
            <h3>#{activeTopic}</h3>
          </div>
          <div className="forum-topic-active-actions">
            {followed.has(activeTopic)
              ? unfollowButton(activeTopic, "Following ✓", "forum-follow-button following")
              : followButton(activeTopic, "+ Follow topic")}
            <Link className="text-action" href={forumHref(scope, null)}>
              Show all topics
            </Link>
          </div>
        </div>
      ) : null}

      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="forum-topic-row">
        <span className="forum-topic-label">Following</span>
        {followedTopics.length > 0 ? (
          <ul>
            {followedTopics.map((topic) => (
              <li className="forum-topic-pill followed" key={topic}>
                <Link
                  href={forumHref(scope, topic)}
                  aria-current={topic === activeTopic ? "page" : undefined}
                >
                  #{topic}
                </Link>
                {unfollowButton(topic, "×", "forum-unfollow-button")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="forum-topic-empty">
            Nothing yet. Follow topics to personalise your For you feed.
          </p>
        )}
      </div>

      {popular.length > 0 ? (
        <div className="forum-topic-row">
          <span className="forum-topic-label">Popular</span>
          <ul>
            {popular.map((item) => (
              <li className="forum-topic-pill" key={item.topic}>
                <Link
                  href={forumHref(scope, item.topic)}
                  aria-current={item.topic === activeTopic ? "page" : undefined}
                >
                  #{item.topic}
                  <small>{item.threadCount}</small>
                </Link>
                {followButton(item.topic, "+")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
