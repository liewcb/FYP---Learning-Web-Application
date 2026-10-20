"use server";

import { revalidatePath } from "next/cache";

import {
  createContentAnalysisController,
  createDocumentController,
  createProfileController,
} from "@/lib/dependencies/server";
import type {
  ContentAnalysisFormState,
  ContentAnalysisFormValues,
} from "@/models/analysis/content-analysis.model";
import type { DocumentUploadFormState } from "@/models/document/document.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function uploadDocumentAction(
  _previous: DocumentUploadFormState,
  formData: FormData,
): Promise<DocumentUploadFormState> {
  const title = field(formData, "title");
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { error: "Choose a PDF or DOCX file to upload.", values: { title } };
  }

  // Server Actions are public entry points, so authentication is checked here
  // again even though the page itself is protected by the session proxy.
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    return { error: "Your session expired. Sign in and try again." };
  }

  const documents = await createDocumentController();
  const state = await documents.upload({ ownerId: viewer.id, title, file });

  if (state.notice) {
    revalidatePath("/documents");
  }

  return state;
}

export async function analyseContentAction(
  _previous: ContentAnalysisFormState,
  formData: FormData,
): Promise<ContentAnalysisFormState> {
  const values: ContentAnalysisFormValues = {
    text: field(formData, "text"),
    topKeywords: field(formData, "topKeywords"),
    topSentences: field(formData, "topSentences"),
    maxTopics: field(formData, "maxTopics"),
  };

  const profiles = await createProfileController();

  if (!(await profiles.currentViewer())) {
    return { error: "Your session expired. Sign in and try again.", values };
  }

  return createContentAnalysisController().analyse(values);
}
