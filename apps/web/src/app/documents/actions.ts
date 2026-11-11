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
import type {
  DocumentDeleteFormState,
  DocumentProcessFormState,
  DocumentRenameFormState,
  DocumentUploadFormState,
} from "@/models/document/document.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function documentId(formData: FormData): number | null {
  const id = Number(field(formData, "documentId"));

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidateDocumentPages(): void {
  revalidatePath("/documents");
  revalidatePath("/documents/manage");
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
    revalidateDocumentPages();
  }

  return state;
}

export async function processDocumentAction(
  _previous: DocumentProcessFormState,
  formData: FormData,
): Promise<DocumentProcessFormState> {
  const id = documentId(formData);
  const profiles = await createProfileController();

  if (!(await profiles.currentViewer())) {
    return { error: "Your session expired. Sign in and try again." };
  }

  if (id === null) {
    return { error: "This document could not be found." };
  }

  const documents = await createDocumentController();
  const state = await documents.process(id);

  // Failures change the document status too, so always refresh the lists.
  revalidateDocumentPages();

  return state;
}

export async function renameDocumentAction(
  _previous: DocumentRenameFormState,
  formData: FormData,
): Promise<DocumentRenameFormState> {
  const id = documentId(formData);
  const profiles = await createProfileController();

  if (!(await profiles.currentViewer())) {
    return { error: "Your session expired. Sign in and try again." };
  }

  if (id === null) {
    return { error: "This document could not be found." };
  }

  const documents = await createDocumentController();
  const state = await documents.rename(id, field(formData, "title"));

  if (state.notice) {
    revalidateDocumentPages();
  }

  return state;
}

export async function deleteDocumentAction(
  _previous: DocumentDeleteFormState,
  formData: FormData,
): Promise<DocumentDeleteFormState> {
  const id = documentId(formData);
  const profiles = await createProfileController();

  if (!(await profiles.currentViewer())) {
    return { error: "Your session expired. Sign in and try again." };
  }

  if (id === null) {
    return { error: "This document could not be found." };
  }

  const documents = await createDocumentController();
  const state = await documents.delete(id);

  if (!state.error) {
    revalidateDocumentPages();
  }

  return state;
}

export async function analyseContentAction(
  _previous: ContentAnalysisFormState,
  formData: FormData,
): Promise<ContentAnalysisFormState> {
  const values: ContentAnalysisFormValues = {
    text: field(formData, "text"),
  };

  const profiles = await createProfileController();

  if (!(await profiles.currentViewer())) {
    return { error: "Your session expired. Sign in and try again.", values };
  }

  const result = await (await createContentAnalysisController()).analyse(
    values,
    documentId(formData),
  );

  if (result.savedAnalysisId) {
    revalidatePath("/");
    revalidatePath("/documents");
    revalidatePath("/quizzes");
  }

  return result;
}
