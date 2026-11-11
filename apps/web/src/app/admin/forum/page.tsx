import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  dismissForumReportAction,
  moderateForumContentAction,
} from "@/app/admin/forum/actions";
import {
  createAdminController,
  createForumModerationController,
} from "@/lib/dependencies/server";
import { parseForumModerationFilters } from "@/models/admin/forum-moderation.model";
import { AdminForumView } from "@/views/admin/admin-forum.view";

export const metadata: Metadata = {
  title: "Forum moderation · Admin",
};

interface AdminForumPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminForumPage({ searchParams }: AdminForumPageProps) {
  const access = await (await createAdminController()).access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  const filters = parseForumModerationFilters(await searchParams);
  const model = await (await createForumModerationController()).load(filters);

  return (
    <AdminForumView
      model={model}
      moderateAction={moderateForumContentAction}
      dismissAction={dismissForumReportAction}
    />
  );
}
