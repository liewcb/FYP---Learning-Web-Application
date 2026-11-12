import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { submitReportAction } from "@/app/reports/actions";
import { studyBuddyAction } from "@/app/study-buddy/actions";
import {
  createProfileController,
  createStudyBuddyController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import {
  parseStudyBuddyFilters,
  parseStudyBuddyTab,
} from "@/models/peers/study-buddy.model";
import { ReportActionProvider } from "@/views/reports/report-action-context.view";
import { StudyBuddyPageView } from "@/views/study-buddy/study-buddy-page.view";

export const metadata: Metadata = {
  title: "Study Buddy",
};

type SearchParamValue = string | string[] | undefined;

interface StudyBuddyPageProps {
  readonly searchParams: Promise<{
    tab?: SearchParamValue;
    q?: SearchParamValue;
    major?: SearchParamValue;
    year?: SearchParamValue;
    interest?: SearchParamValue;
    mode?: SearchParamValue;
  }>;
}

export default async function StudyBuddyPage({ searchParams }: StudyBuddyPageProps) {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const params = await searchParams;
  const controller = await createStudyBuddyController();
  const page = await controller.loadPage({
    viewerId: viewer.id,
    tab: parseStudyBuddyTab(params.tab),
    filters: parseStudyBuddyFilters(params),
  });

  return (
    <ReportActionProvider action={submitReportAction}>
      <StudyBuddyPageView
        viewer={viewer}
        page={page}
        action={studyBuddyAction}
        signOutAction={signOutAction}
      />
    </ReportActionProvider>
  );
}
