import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signInAction } from "@/app/auth/actions";
import { createProfileController } from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { passwordResetMessages } from "@/models/auth/password-reset.model";
import { authRoutes, safeRedirectPath } from "@/models/auth/auth-routes";
import { SignInView } from "@/views/auth/sign-in.view";

export const metadata: Metadata = {
  title: "Sign in",
};

const pageErrors: Record<string, string> = {
  confirmation_failed:
    "That confirmation link is invalid or has expired. Try logging in, or register again to get a new link.",
};

const pageNotices: Record<string, string> = {
  password_reset: passwordResetMessages.passwordUpdated,
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // The proxy verifies the session token, while this page also requires the
  // matching profile row. Keeping this decision here prevents a redirect loop
  // when a stale or incomplete account has a valid token but no usable profile.
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (viewer) {
    redirect(viewer.role === "admin" ? adminBasePath : authRoutes.home);
  }

  const { next, error, notice } = await searchParams;
  const nextPath = typeof next === "string" ? safeRedirectPath(next) : undefined;
  const initialError = typeof error === "string" ? pageErrors[error] : undefined;
  const initialNotice =
    typeof notice === "string" ? pageNotices[notice] : undefined;

  return (
    <SignInView
      action={signInAction}
      next={nextPath}
      initialError={initialError}
      initialNotice={initialNotice}
    />
  );
}
