import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  addForumCommentAction,
  createForumThreadAction,
  deleteForumCommentAction,
  deleteForumThreadAction,
  reportForumContentAction,
  toggleForumUpvoteAction,
} from "@/app/forum/actions";
import {
  createForumController,
  createProfileController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { parseForumFeedScope } from "@/models/forum/forum.model";
import { ForumPageView } from "@/views/forum/forum-page.view";

export const metadata: Metadata = {
  title: "Forum",
};

interface ForumPageProps {
  readonly searchParams: Promise<{ scope?: string | string[] }>;
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

  const scope = parseForumFeedScope((await searchParams).scope);
  const forum = await createForumController();
  const threads = await forum.list(scope, viewer.id);

  return (
    <ForumPageView
      viewer={viewer}
      scope={scope}
      threads={threads}
      createThreadAction={createForumThreadAction}
      addCommentAction={addForumCommentAction}
      toggleUpvoteAction={toggleForumUpvoteAction}
      deleteThreadAction={deleteForumThreadAction}
      deleteCommentAction={deleteForumCommentAction}
      reportAction={reportForumContentAction}
      signOutAction={signOutAction}
    />
  );
}
