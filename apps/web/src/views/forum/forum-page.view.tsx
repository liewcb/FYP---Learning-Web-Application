import Link from "next/link";

import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import type {
  ForumCommentFormState,
  ForumFeedScope,
  ForumThread,
  ForumThreadFormState,
} from "@/models/forum/forum.model";
import { CreateThreadView } from "@/views/forum/create-thread.view";
import { ForumThreadView } from "@/views/forum/forum-thread.view";
import type { ForumReportAction } from "@/views/forum/report-content.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface ForumPageViewProps {
  readonly viewer: Viewer;
  readonly scope: ForumFeedScope;
  readonly threads: readonly ForumThread[];
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
  readonly signOutAction: () => Promise<void>;
}

const feedLinks: readonly {
  scope: ForumFeedScope;
  label: string;
  description: string;
}[] = [
  { scope: "community", label: "Community", description: "All student discussions" },
  { scope: "connections", label: "Connections", description: "Reserved for peer module" },
  { scope: "mine", label: "My posts", description: "Discussions you created" },
];

export function ForumPageView({
  viewer,
  scope,
  threads,
  createThreadAction,
  addCommentAction,
  toggleUpvoteAction,
  deleteThreadAction,
  deleteCommentAction,
  reportAction,
  signOutAction,
}: ForumPageViewProps) {
  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation("Forum")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content">
        <header className="module-page-header forum-page-header">
          <div>
            <p className="section-kicker">Academic Discussion Forum</p>
            <h1>Ask, explain and learn with your community.</h1>
            <p>
              Publish study questions, attach supporting material, exchange
              comments and upvote explanations that help other students.
            </p>
          </div>
          <span className="forum-community-badge">Signed-in community</span>
        </header>

        <nav className="forum-feed-tabs" aria-label="Forum feeds">
          {feedLinks.map((feed) => (
            <Link
              className={scope === feed.scope ? "active" : undefined}
              href={`/forum?scope=${feed.scope}`}
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
            <CreateThreadView action={createThreadAction} />
          </aside>

          <section className="forum-feed" aria-label={`${scope} forum feed`}>
            <div className="forum-feed-heading">
              <div>
                <p className="section-kicker">{scope === "mine" ? "Your activity" : "Latest posts"}</p>
                <h2>{scope === "connections" ? "Connections feed" : "Recent discussions"}</h2>
              </div>
              <span>{threads.length} shown</span>
            </div>

            {scope === "connections" ? (
              <div className="forum-feed-empty">
                <span aria-hidden="true">◎</span>
                <h2>Ready for the peer connection module</h2>
                <p>
                  This feed is intentionally reserved. Once your teammate adds
                  confirmed connections, only the repository filter and RLS
                  visibility rule need to be connected.
                </p>
                <Link href="/forum?scope=community">Return to Community</Link>
              </div>
            ) : threads.length > 0 ? (
              threads.map((thread) => (
                <ForumThreadView
                  key={thread.id}
                  thread={thread}
                  addCommentAction={addCommentAction}
                  toggleUpvoteAction={toggleUpvoteAction}
                  deleteThreadAction={deleteThreadAction}
                  deleteCommentAction={deleteCommentAction}
                  reportAction={reportAction}
                />
              ))
            ) : (
              <div className="forum-feed-empty">
                <span aria-hidden="true">✦</span>
                <h2>{scope === "mine" ? "You have not posted yet" : "Start the first discussion"}</h2>
                <p>
                  Use the discussion form to ask a question or share a useful
                  explanation with other signed-in students.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
