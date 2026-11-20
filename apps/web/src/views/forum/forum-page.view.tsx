import Link from "next/link";

import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import {
  forumHref,
  type ForumCommentFormState,
  type ForumFeedContext,
  type ForumFeedScope,
  type ForumThread,
  type ForumThreadFormState,
} from "@/models/forum/forum.model";
import { CreateThreadView } from "@/views/forum/create-thread.view";
import {
  ForumTopicsView,
  type ForumFollowTopicAction,
} from "@/views/forum/forum-topics.view";
import { ForumThreadView } from "@/views/forum/forum-thread.view";
import type { ForumReportAction } from "@/views/forum/report-content.view";
import type { ForumEditAction } from "@/views/forum/editable-forum-content.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface ForumPageViewProps {
  readonly viewer: Viewer;
  readonly scope: ForumFeedScope;
  readonly topic: string | null;
  readonly threads: readonly ForumThread[];
  readonly context: ForumFeedContext;
  readonly followTopicAction: ForumFollowTopicAction;
  readonly unfollowTopicAction: (formData: FormData) => Promise<void>;
  readonly createThreadAction: (
    state: ForumThreadFormState,
    formData: FormData,
  ) => Promise<ForumThreadFormState>;
  readonly addCommentAction: (
    state: ForumCommentFormState,
    formData: FormData,
  ) => Promise<ForumCommentFormState>;
  readonly toggleUpvoteAction: (formData: FormData) => Promise<void>;
  readonly deleteThreadAction: (formData: FormData) => Promise<void>;
  readonly deleteCommentAction: (formData: FormData) => Promise<void>;
  readonly reportAction: ForumReportAction;
  readonly editThreadAction: ForumEditAction;
  readonly editCommentAction: ForumEditAction;
  readonly signOutAction: () => Promise<void>;
}

const feedLinks: readonly {
  scope: ForumFeedScope;
  label: string;
  description: string;
}[] = [
  { scope: "for_you", label: "For you", description: "Picked by your topics and buddies" },
  { scope: "latest", label: "Latest", description: "Every post, newest first" },
  { scope: "connections", label: "Connections", description: "Posts from your study buddies" },
  { scope: "mine", label: "My posts", description: "Discussions you created" },
];

const feedHeadings: Record<ForumFeedScope, { kicker: string; title: string }> = {
  for_you: { kicker: "Recommended", title: "For you" },
  latest: { kicker: "Latest posts", title: "Recent discussions" },
  connections: { kicker: "Study buddies", title: "Connections feed" },
  mine: { kicker: "Your activity", title: "My posts" },
};

function emptyFeed(
  scope: ForumFeedScope,
  topic: string | null,
  buddyCount: number,
): { title: string; body: string; link?: { href: string; label: string } } {
  if (scope === "connections" && buddyCount === 0) {
    return {
      title: "No study buddies yet",
      body: "Connect with classmates to see what they post here.",
      link: { href: "/study-buddy", label: "Find study buddies" },
    };
  }

  if (topic) {
    return {
      title: `No posts about #${topic} here yet`,
      body: "Start the discussion, or look at other topics.",
      link: { href: forumHref(scope, null), label: "Show all topics" },
    };
  }

  switch (scope) {
    case "for_you":
      return {
        title: "Nothing to recommend yet",
        body: "Follow a few topics or browse the latest posts from the last month.",
        link: { href: "/forum?scope=latest", label: "See latest posts" },
      };
    case "connections":
      return {
        title: "Your study buddies have not posted yet",
        body: "Posts they share with everyone or with buddies only will appear here.",
      };
    case "mine":
      return { title: "You have not posted yet", body: "Ask a question or share an explanation." };
    default:
      return {
        title: "Start the first discussion",
        body: "Ask a question or share an explanation to get it going.",
      };
  }
}

export function ForumPageView({
  viewer,
  scope,
  topic,
  threads,
  context,
  followTopicAction,
  unfollowTopicAction,
  createThreadAction,
  addCommentAction,
  toggleUpvoteAction,
  deleteThreadAction,
  deleteCommentAction,
  reportAction,
  editThreadAction,
  editCommentAction,
  signOutAction,
}: ForumPageViewProps) {
  const empty = emptyFeed(scope, topic, context.buddyCount);

  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation("Forum")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        avatarUrl={viewer.avatarUrl}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content">
        <header className="module-page-header forum-page-header">
          <div>
            <h1>Discussion forum</h1>
            <p>
              Ask questions, share explanations and upvote the best answers.
            </p>
          </div>
          <span className="forum-community-badge">Signed-in community</span>
        </header>

        <nav className="forum-feed-tabs" aria-label="Forum feeds">
          {feedLinks.map((feed) => (
            <Link
              className={scope === feed.scope ? "active" : undefined}
              href={forumHref(feed.scope, topic)}
              aria-current={scope === feed.scope ? "page" : undefined}
              key={feed.scope}
            >
              <strong>{feed.label}</strong>
              <span>{feed.description}</span>
            </Link>
          ))}
        </nav>

        <div className="forum-layout">
          <aside className="forum-compose-column">
            <CreateThreadView
              action={createThreadAction}
              topicSuggestions={[
                ...context.followedTopics,
                ...context.popularTopics.map((item) => item.topic),
              ]}
              currentTopic={topic}
              hasStudyBuddies={context.buddyCount > 0}
            />
          </aside>

          <section className="forum-feed" aria-label={`${feedHeadings[scope].title} feed`}>
            <ForumTopicsView
              scope={scope}
              activeTopic={topic}
              followedTopics={context.followedTopics}
              popularTopics={context.popularTopics}
              followAction={followTopicAction}
              unfollowAction={unfollowTopicAction}
            />

            <div className="forum-feed-heading">
              <div>
                <p className="section-kicker">{feedHeadings[scope].kicker}</p>
                <h2>
                  {feedHeadings[scope].title}
                  {topic ? ` · #${topic}` : ""}
                </h2>
              </div>
              <span>{threads.length} shown</span>
            </div>

            {scope === "for_you" && context.followedTopics.length === 0 && threads.length > 0 ? (
              <p className="forum-feed-hint" role="note">
                Follow a few topics above to make this feed more yours. Until then it shows
                popular and new posts, and posts from your study buddies.
              </p>
            ) : null}

            {threads.length > 0 ? (
              threads.map((thread) => (
                <ForumThreadView
                  key={thread.id}
                  thread={thread}
                  scope={scope}
                  addCommentAction={addCommentAction}
                  toggleUpvoteAction={toggleUpvoteAction}
                  deleteThreadAction={deleteThreadAction}
                  deleteCommentAction={deleteCommentAction}
                  reportAction={reportAction}
                  editThreadAction={editThreadAction}
                  editCommentAction={editCommentAction}
                />
              ))
            ) : (
              <div className="forum-feed-empty">
                <span aria-hidden="true">{scope === "connections" ? "◎" : "✦"}</span>
                <h2>{empty.title}</h2>
                <p>{empty.body}</p>
                {empty.link ? <Link href={empty.link.href}>{empty.link.label}</Link> : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
