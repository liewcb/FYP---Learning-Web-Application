"use server";

import { revalidatePath } from "next/cache";

import {
  createProfileController,
  createStudyBuddyController,
} from "@/lib/dependencies/server";
import {
  isStudyBuddyActionIntent,
  type StudyBuddyActionState,
} from "@/models/peers/study-buddy.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function studyBuddyAction(
  _previous: StudyBuddyActionState,
  formData: FormData,
): Promise<StudyBuddyActionState> {
  const intent = field(formData, "intent");

  if (!isStudyBuddyActionIntent(intent)) {
    return { error: "Unknown action." };
  }

  // Server Actions are public entry points, so authentication is checked here.
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    return { error: "Your session expired. Sign in and try again." };
  }

  if (viewer.role !== "student") {
    return { error: "Only student accounts can add study buddies." };
  }

  const buddies = await createStudyBuddyController();
  const state = await buddies.act(intent, field(formData, "studentId"));

  revalidatePath("/study-buddy");

  return state;
}
