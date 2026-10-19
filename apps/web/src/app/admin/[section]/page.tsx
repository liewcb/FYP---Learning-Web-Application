import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { createAdminController } from "@/lib/dependencies/server";
import { findAdminSection } from "@/models/admin/admin.model";
import { AdminPlaceholderView } from "@/views/admin/admin-placeholder.view";

export async function generateMetadata({
  params,
}: PageProps<"/admin/[section]">): Promise<Metadata> {
  const section = findAdminSection((await params).section);

  return { title: section?.label ?? "Admin" };
}

export default async function AdminSectionPage({
  params,
}: PageProps<"/admin/[section]">) {
  const controller = await createAdminController();
  const access = await controller.access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  const section = controller.section((await params).section);

  if (!section) {
    notFound();
  }

  return <AdminPlaceholderView section={section} />;
}
