import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  createLibraryController,
  createProfileController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { parseLibraryFilters, parseLibraryTab } from "@/models/library/library.model";
import { LibraryPageView } from "@/views/library/library-page.view";

export const metadata: Metadata = {
  title: "Library",
};

type SearchParamValue = string | string[] | undefined;

interface LibraryPageProps {
  readonly searchParams: Promise<{
    tab?: SearchParamValue;
    q?: SearchParamValue;
    subject?: SearchParamValue;
    sort?: SearchParamValue;
    submitted?: SearchParamValue;
  }>;
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const params = await searchParams;
  const controller = await createLibraryController();
  const model = await controller.loadPage({
    viewerId: viewer.id,
    tab: parseLibraryTab(params.tab),
    filters: parseLibraryFilters(params),
  });

  return (
    <LibraryPageView
      viewer={viewer}
      model={model}
      justSubmitted={params.submitted === "1"}
      signOutAction={signOutAction}
    />
  );
}