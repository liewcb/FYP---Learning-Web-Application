import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  createProfileController,
  createQuizAttemptController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { QuizAttemptReviewView } from "@/views/quizzes/quiz-attempt-review.view";

export const metadata: Metadata = {
  title: "Quiz attempt review",
};

interface QuizAttemptReviewPageProps {
  readonly params: Promise<{ id: string }>;
}

function attemptId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function QuizAttemptReviewPage({ params }: QuizAttemptReviewPageProps) {
  const viewer = await (await createProfileController()).currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const id = attemptId((await params).id);

  if (id === null) {
    notFound();
  }

  // Row-level security and the review function both scope this lookup to the
  // signed-in student, so another student's attempt is a normal not-found.
  const review = await (await createQuizAttemptController()).review(id);

  if (!review) {
    notFound();
  }

  return <QuizAttemptReviewView viewer={viewer} review={review} signOutAction={signOutAction} />;
}
