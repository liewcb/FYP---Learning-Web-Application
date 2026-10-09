import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { createAdminController } from "@/lib/dependencies/server";
import { AdminShell } from "@/views/admin/admin-shell.view";

export const metadata: Metadata = {
  title: "Admin | LearnTogether AI",
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const controller = await createAdminController();
  const access = await controller.access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  return (
    <AdminShell viewer={access.viewer} signOutAction={signOutAction}>
      {children}
    </AdminShell>
  );
}
