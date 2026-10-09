import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { updateProfileAction } from "@/app/profile/actions";
import {
  createAdminController,
  createProfileController,
} from "@/lib/dependencies/server";
import { authRoutes } from "@/models/auth/auth-routes";
import { ProfileView } from "@/views/profile/profile.view";

export const metadata: Metadata = {
  title: "My profile | Admin | LearnTogether AI",
};

export default async function AdminProfilePage() {
  const admin = await createAdminController();
  const access = await admin.access();

  if (access.status === "denied") {
    redirect(access.redirectTo);
  }

  const profiles = await createProfileController();
  const model = await profiles.page();

  if (!model) {
    redirect(authRoutes.signIn);
  }

  return <ProfileView model={model} updateAction={updateProfileAction} />;
}
