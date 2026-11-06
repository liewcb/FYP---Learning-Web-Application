"use server";

import { revalidatePath } from "next/cache";

import {
  createAdminController,
  createLibraryController,
} from "@/lib/dependencies/server";
import {
  isLibraryDecision,
  parseLibraryId,
  type LibraryReviewFormState,
} from "@/models/library/library.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function reviewLibraryMaterialAction(
  _previous: LibraryReviewFormState,
  formData: FormData,
): Promise<LibraryReviewFormState> {
  // Every admin action checks access itself; layouts are not enough.
  const admin = await createAdminController();
  const access = await admin.access();

  if (access.status === "denied") {
    return { error: "You do not have permission to review materials." };
  }

  const materialId = parseLibraryId(field(formData, "materialId"));
  const decision = field(formData, "decision");
  const note = field(formData, "note");

  if (materialId === null || !isLibraryDecision(decision)) {
    return { error: "This decision could not be understood.", note };
  }

  const library = await createLibraryController();
  const state = await library.decide({
    materialId,
    reviewerId: access.viewer.id,
    decision,
    rawNote: note,
  });

  if (state.notice) {
    revalidatePath("/admin/library");
    revalidatePath("/library");
  }

  return state;
}