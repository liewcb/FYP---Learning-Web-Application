import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { checkUsernameAction, signUpAction } from "@/app/auth/actions";
import { createProfileController } from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { SignUpView } from "@/views/auth/sign-up.view";

export const metadata: Metadata = {
  title: "Create account",
};

export default async function RegisterPage() {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (viewer) {
    redirect(viewer.role === "admin" ? adminBasePath : authRoutes.home);
  }

  return <SignUpView action={signUpAction} checkUsername={checkUsernameAction} />;
}
