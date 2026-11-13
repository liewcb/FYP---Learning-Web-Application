"use server";

import { revalidatePath } from "next/cache";

import { createProfileController } from "@/lib/dependencies/server";
import type { AvatarUpdateState } from "@/models/profile/avatar.model";
import type { ProfileFormState } from "@/models/profile/profile.model";

function isString(value: FormDataEntryValue): value is string {
  return typeof value === "string";
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function updateProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const controller = await createProfileController();
  const state = await controller.update({
    fullName: field(formData, "fullName"),
    username: field(formData, "username"),
    academicMajor: field(formData, "academicMajor"),
    yearOfStudy: field(formData, "yearOfStudy"),
    bio: field(formData, "bio"),
    interests: field(formData, "interests"),
    studyTimes: formData.getAll("studyTimes").filter(isString),
    studyMode: field(formData, "studyMode"),
    isDiscoverable: formData.get("isDiscoverable") === "on",
  });

  if (state.notice) {
    // Names and initials appear in the top bar and admin sidebar too.
    revalidatePath("/", "layout");
  }

  return state;
}

export async function uploadAvatarAction(formData: FormData): Promise<AvatarUpdateState> {
  const file = formData.get("avatar");
  const controller = await createProfileController();
  const state = await controller.uploadAvatar(file instanceof Blob ? file : null);

  if (state.status === "saved") {
    // The picture appears in the top bar of every page.
    revalidatePath("/", "layout");
  }

  return state;
}

export async function removeAvatarAction(): Promise<AvatarUpdateState> {
  const controller = await createProfileController();
  const state = await controller.removeAvatar();

  if (state.status === "saved") {
    revalidatePath("/", "layout");
  }

  return state;
}
