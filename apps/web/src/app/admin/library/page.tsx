import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { reviewLibraryMaterialAction } from "@/app/admin/library/action";
import {
  createAdminController,
  createLibraryController,
} from "@/lib/dependencies/server";
import { parseLibraryReviewFilter } from "@/models/library/library.model";
import { AdminLibraryView } from "@/views/admin/admin-library.view";

export const metadata: Metadata = {
  title: "Learning library · Admin",
};

interface AdminLibraryPageProps {
  readonly searchParams: Promise<{ status?: string | string[] }>;
}

export default async function AdminLibraryPage({ searchParams }: AdminLibraryPageProps) {
  const admin = await createAdminController();
  const access = await admin.access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  const filter = parseLibraryReviewFilter((await searchParams).status);
  const library = await createLibraryController();
  const model = await library.reviewQueue(filter);

  return <AdminLibraryView model={model} reviewAction={reviewLibraryMaterialAction} />;
}