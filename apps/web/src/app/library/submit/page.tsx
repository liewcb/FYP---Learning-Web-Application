import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { submitLibraryMaterialAction } from "@/app/library/actions";
import {
  createLibraryController,
  createProfileController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { parseLibraryId } from "@/models/library/library.model";
import { LibrarySubmitPageView } from "@/views/library/library-submit-page.view";

export const metadata: Metadata = {
  title: "Share to Library",
};

interface LibrarySubmitPageProps {
  readonly searchParams: Promise<{ documentId?: string | string[] }>;
}

export default async function LibrarySubmitPage({ searchParams }: LibrarySubmitPageProps) {
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
  const model = await controller.loadSubmitPage({
    viewerId: viewer.id,
    requestedDocumentId:
      typeof params.documentId === "string" ? parseLibraryId(params.documentId) : null,
  });

  return (
    <LibrarySubmitPageView
      viewer={viewer}
      model={model}
      action={submitLibraryMaterialAction}
      signOutAction={signOutAction}
    />
  );
}