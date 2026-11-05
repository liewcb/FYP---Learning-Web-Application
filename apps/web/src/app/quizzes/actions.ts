"use server";

import { revalidatePath } from "next/cache";

import {
  createProfileController,
  createQuizController,
} from "@/lib/dependencies/server";
import type {
  QuizGenerationFormState,
  QuizGenerationFormValues,
} from "@/models/quiz/quiz.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function isString(value: FormDataEntryValue): value is string {
  return typeof value === "string";
}

function documentId(formData: FormData): number | null {
  const id = Number(field(formData, "documentId"));

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function generateQuizAction(
  _previous: QuizGenerationFormState,
  formData: FormData,
): Promise<QuizGenerationFormState> {
  const values: QuizGenerationFormValues = {
    materialTitle: field(formData, "materialTitle"),
    text: field(formData, "text"),
    questionCount: field(formData, "questionCount"),
    difficulty: field(formData, "difficulty"),
    questionTypes: formData.getAll("questionTypes").filter(isString),
  };

  const profiles = await createProfileController();

  if (!(await profiles.currentViewer())) {
    return { error: "Your session expired. Sign in and try again.", values };
  }

  const result = await (await createQuizController()).generate(values, documentId(formData));

  if (result.savedQuizId) {
    revalidatePath("/");
    revalidatePath("/documents");
    revalidatePath("/quizzes");
  }

  return result;
}

