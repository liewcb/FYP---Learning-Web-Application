import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  createLibraryController,
  createProfileController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { parseLibraryId } from "@/models/library/library.model";
import { LibraryDetailView } from "@/views/library/library-detail.view";

export const metadata: Metadata = {
  title: "Library material",
};

interface LibraryDetailPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function LibraryDetailPage({ params }: LibraryDetailPageProps) {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const id = parseLibraryId((await params).id);

  if (id === null) {
    notFound();
  }

  const controller = await createLibraryController();
  const model = await controller.loadMaterial(id, viewer);

  if (!model) {
    // Unpublished materials of other students are hidden by row-level security.
    notFound();
  }

  return <LibraryDetailView viewer={viewer} model={model} signOutAction={signOutAction} />;
}