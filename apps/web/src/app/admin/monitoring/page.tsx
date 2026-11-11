import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  createAdminController,
  createSystemMonitoringController,
} from "@/lib/dependencies/server";
import { AdminMonitoringView } from "@/views/admin/admin-monitoring.view";

export const metadata: Metadata = {
  title: "System monitoring · Admin",
};

export default async function AdminMonitoringPage() {
  const access = await (await createAdminController()).access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  const model = await (await createSystemMonitoringController()).load();

  return <AdminMonitoringView model={model} />;
}
