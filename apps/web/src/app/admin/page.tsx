import { redirect } from "next/navigation";

import { createAdminController } from "@/lib/dependencies/server";
import { AdminDashboardView } from "@/views/admin/admin-dashboard.view";

export default async function AdminDashboardPage() {
  const controller = await createAdminController();
  const access = await controller.access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  return <AdminDashboardView model={controller.dashboard(access.viewer)} />;
}
