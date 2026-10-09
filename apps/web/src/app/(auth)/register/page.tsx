import type { Metadata } from "next";

import { checkUsernameAction, signUpAction } from "@/app/auth/actions";
import { SignUpView } from "@/views/auth/sign-up.view";

export const metadata: Metadata = {
  title: "Create account | LearnTogether AI",
};

export default function RegisterPage() {
  return <SignUpView action={signUpAction} checkUsername={checkUsernameAction} />;
}
