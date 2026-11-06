"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createLibraryController,
  createProfileController,
} from "@/lib/dependencies/server";
import type {
  LibrarySubmitFormState,
  LibrarySubmitFormValues,
} from "@/models/library/library.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function submitLibraryMaterialAction(
  _previous: LibrarySubmitFormState,
  formData: FormData,
): Promise<LibrarySubmitFormState> {
  const values: LibrarySubmitFormValues = {
    documentId: field(formData, "documentId"),
    title: field(formData, "title"),
    description: field(formData, "description"),
    subjectName: field(formData, "subjectName"),
    moduleCode: field(formData, "moduleCode"),
    tags: field(formData, "tags"),
  };

  // Server Actions are public entry points, so the account is checked here.
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    return { error: "Your session expired. Sign in and try again.", values };
  }

  if (viewer.role !== "student") {
    return { error: "Only student accounts can submit library materials.", values };
  }

  const library = await createLibraryController();
  const result = await library.submit({ viewerId: viewer.id, values });

  if (!result.ok) {
    return result.state;
  }

  revalidatePath("/library");
  revalidatePath("/admin/library");
  redirect("/library?tab=mine&submitted=1");
}