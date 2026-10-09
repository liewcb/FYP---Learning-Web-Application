import type { Metadata } from "next";

import { signInAction } from "@/app/auth/actions";
import { safeRedirectPath } from "@/models/auth/auth-routes";
import { SignInView } from "@/views/auth/sign-in.view";

export const metadata: Metadata = {
  title: "Log in | LearnTogether AI",
};

const pageErrors: Record<string, string> = {
  confirmation_failed:
    "That confirmation link is invalid or has expired. Try logging in, or register again to get a new link.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" ? safeRedirectPath(next) : undefined;
  const initialError = typeof error === "string" ? pageErrors[error] : undefined;

  return (
    <SignInView
      action={signInAction}
      next={nextPath}
      initialError={initialError}
    />
  );
}
