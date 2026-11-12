import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  createProfileController,
  createReportController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import type { MyReport } from "@/models/reports/report.model";
import { MyReportsPageView } from "@/views/reports/my-reports-page.view";

export const metadata: Metadata = {
  title: "My reports",
};

export default async function MyReportsPage() {
  const viewer = await (await createProfileController()).currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  let reports: MyReport[] = [];
  let loadError: string | null = null;

  try {
    reports = await (await createReportController()).listMine();
  } catch (error) {
    console.error("Loading reports failed.", error);
    loadError = "Your reports could not be loaded. Please try again.";
  }

  return (
    <MyReportsPageView
      viewer={viewer}
      reports={reports}
      loadError={loadError}
      signOutAction={signOutAction}
    />
  );
}
