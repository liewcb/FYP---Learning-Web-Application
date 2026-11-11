import { redirect } from "next/navigation";

import {
  createAdminController,
  createSystemMonitoringController,
} from "@/lib/dependencies/server";
import { AdminDashboardView } from "@/views/admin/admin-dashboard.view";

export default async function AdminDashboardPage() {
  const controller = await createAdminController();
  const access = await controller.access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  const monitoring = await (await createSystemMonitoringController())
    .load()
    .catch((error: unknown) => {
      console.error("Admin dashboard figures failed to load.", error);
      return null;
    });

  return <AdminDashboardView model={controller.dashboard(access.viewer, monitoring)} />;
}
