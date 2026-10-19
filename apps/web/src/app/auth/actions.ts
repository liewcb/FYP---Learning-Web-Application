"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  createAuthController,
  createPasswordResetController,
} from "@/lib/dependencies/server";
import { authRoutes } from "@/models/auth/auth-routes";
import type {
  SignInFormState,
  SignUpFormState,
  UsernameCheck,
} from "@/models/auth/auth.model";
import {
  initialPasswordResetState,
  type NewPasswordFormState,
  type PasswordResetFormState,
} from "@/models/auth/password-reset.model";

function isString(value: FormDataEntryValue): value is string {
  return typeof value === "string";
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function signInAction(
  _previous: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const controller = await createAuthController();
  const result = await controller.signIn(
    {
      identifier: field(formData, "identifier"),
      password: field(formData, "password"),
    },
    formData.get("next"),
  );

  if (result.status === "show") {
    return result.state;
  }

  revalidatePath("/", "layout");
  redirect(result.to);
}

async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();

  return (
    requestHeaders.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  );
}

/**
 * Drives the forgot-password form. `intent` is set by the button pressed:
 * send (or resend) the reset link, or start again with another account.
 */
export async function passwordResetAction(
  _previous: PasswordResetFormState,
  formData: FormData,
): Promise<PasswordResetFormState> {
  const intent = field(formData, "intent");
  const identifier = field(formData, "identifier");

  if (intent === "restart") {
    return { ...initialPasswordResetState, identifier };
  }

  const controller = await createPasswordResetController();

  return controller.requestLink(identifier, await requestOrigin());
}

export async function setNewPasswordAction(
  _previous: NewPasswordFormState,
  formData: FormData,
): Promise<NewPasswordFormState> {
  const controller = await createPasswordResetController();
  const result = await controller.setNewPassword({
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
  });

  if (result.status === "show") {
    return result.state;
  }

  revalidatePath("/", "layout");
  redirect(result.to);
}

export async function signUpAction(
  _previous: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  const origin = await requestOrigin();
  const controller = await createAuthController();
  const result = await controller.signUp(
    {
      fullName: field(formData, "fullName"),
      username: field(formData, "username"),
      email: field(formData, "email"),
      password: field(formData, "password"),
      confirmPassword: field(formData, "confirmPassword"),
      academicMajor: field(formData, "academicMajor"),
      yearOfStudy: field(formData, "yearOfStudy"),
      interests: field(formData, "interests"),
      studyTimes: formData.getAll("studyTimes").filter(isString),
      studyMode: field(formData, "studyMode"),
      isDiscoverable: formData.get("isDiscoverable") === "on",
    },
    origin,
  );

  if (result.status === "show") {
    return result.state;
  }

  revalidatePath("/", "layout");
  redirect(result.to);
}

export async function checkUsernameAction(
  username: string,
): Promise<UsernameCheck> {
  const controller = await createAuthController();

  return controller.checkUsername(typeof username === "string" ? username : "");
}

export async function signOutAction(): Promise<void> {
  const controller = await createAuthController();
  await controller.signOut();

  revalidatePath("/", "layout");
  redirect(authRoutes.signIn);
}
