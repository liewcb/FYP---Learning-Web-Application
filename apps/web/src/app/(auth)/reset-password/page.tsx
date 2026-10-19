import type { Metadata } from "next";

import { setNewPasswordAction } from "@/app/auth/actions";
import { createPasswordResetController } from "@/lib/dependencies/server";
import { ResetPasswordView } from "@/views/auth/reset-password.view";

export const metadata: Metadata = {
  title: "Set a new password | LearnTogether AI",
};

export default async function ResetPasswordPage() {
  const controller = await createPasswordResetController();
  const page = await controller.newPasswordPage();

  return (
    <ResetPasswordView
      email={page.status === "ready" ? page.email : null}
      action={setNewPasswordAction}
    />
  );
}
