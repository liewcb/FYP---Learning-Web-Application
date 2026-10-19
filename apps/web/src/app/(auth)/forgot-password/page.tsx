import type { Metadata } from "next";

import { passwordResetAction } from "@/app/auth/actions";
import { passwordResetMessages } from "@/models/auth/password-reset.model";
import { ForgotPasswordView } from "@/views/auth/forgot-password.view";

export const metadata: Metadata = {
  title: "Forgot password | LearnTogether AI",
};

const pageErrors: Record<string, string> = {
  link_expired: passwordResetMessages.linkExpired,
};

export default async function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  const { error } = await searchParams;

  return (
    <ForgotPasswordView
      action={passwordResetAction}
      initialError={typeof error === "string" ? pageErrors[error] : undefined}
    />
  );
}
