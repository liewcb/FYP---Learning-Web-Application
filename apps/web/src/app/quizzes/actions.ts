"use server";

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

  return createQuizController().generate(values);
}
