"use server";

import { revalidatePath } from "next/cache";

import {
  createProfileController,
  createQuizAttemptController,
  createQuizController,
} from "@/lib/dependencies/server";
import type { QuizAttemptOutcome } from "@/models/quiz/quiz-attempt.model";
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

/**
 * Grades and stores an attempt for a saved quiz. Grading happens in the
 * database against private answer keys, so the browser never sees the key
 * before the student submits.
 */
export async function submitQuizAttemptAction(
  quizId: number,
  answers: Record<string, string>,
  startedAt: string | null,
): Promise<QuizAttemptOutcome> {
  const profiles = await createProfileController();

  if (!(await profiles.currentViewer())) {
    return { ok: false, error: "Your session expired. Sign in and try again." };
  }

  const outcome = await (await createQuizAttemptController()).submit(
    quizId,
    answers,
    startedAt,
  );

  if (outcome.ok) {
    revalidatePath("/quizzes");
    revalidatePath("/quizzes/attempts");
  }

  return outcome;
}
