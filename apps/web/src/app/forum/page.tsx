import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  addForumCommentAction,
  createForumThreadAction,
  deleteForumCommentAction,
  deleteForumThreadAction,
  editForumCommentAction,
  editForumThreadAction,
  followForumTopicAction,
  reportForumContentAction,
  toggleForumUpvoteAction,
  unfollowForumTopicAction,
} from "@/app/forum/actions";
import {
  createForumController,
  createProfileController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { parseForumFeedScope, parseForumTopicFilter } from "@/models/forum/forum.model";
import { ForumPageView } from "@/views/forum/forum-page.view";

export const metadata: Metadata = {
  title: "Forum",
};

interface ForumPageProps {
  readonly searchParams: Promise<{ scope?: string | string[]; topic?: string | string[] }>;
}

export default async function ForumPage({ searchParams }: ForumPageProps) {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const params = await searchParams;
  const scope = parseForumFeedScope(params.scope);
  const topic = parseForumTopicFilter(params.topic);
  const forum = await createForumController();
  const [threads, context] = await Promise.all([
    forum.list({ scope, viewerId: viewer.id, topic }),
    forum.feedContext(viewer.id),
  ]);

  return (
    <ForumPageView
      viewer={viewer}
      scope={scope}
      topic={topic}
      threads={threads}
      context={context}
      followTopicAction={followForumTopicAction}
      unfollowTopicAction={unfollowForumTopicAction}
      createThreadAction={createForumThreadAction}
      addCommentAction={addForumCommentAction}
      toggleUpvoteAction={toggleForumUpvoteAction}
      deleteThreadAction={deleteForumThreadAction}
      deleteCommentAction={deleteForumCommentAction}
      reportAction={reportForumContentAction}
      editThreadAction={editForumThreadAction}
      editCommentAction={editForumCommentAction}
      signOutAction={signOutAction}
    />
  );
}
