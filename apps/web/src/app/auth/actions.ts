"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createAuthController } from "@/lib/dependencies/server";
import { authRoutes } from "@/models/auth/auth-routes";
import type {
  SignInFormState,
  SignUpFormState,
  UsernameCheck,
} from "@/models/auth/auth.model";

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

export async function signUpAction(
  _previous: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

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
