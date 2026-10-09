import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { HomeController } from "@/controllers/home/home.controller";
import { createProfileController } from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { HomeView } from "@/views/home/home.view";

export default async function Home() {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  // The proxy already redirects guests; this guards against a stale session.
  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const controller = new HomeController();

  return (
    <HomeView model={controller.show(viewer)} signOutAction={signOutAction} />
  );
}
