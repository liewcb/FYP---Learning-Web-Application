import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  createProfileController,
  createQuizAttemptController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { QuizAttemptHistoryView } from "@/views/quizzes/quiz-attempt-history.view";

export const metadata: Metadata = {
  title: "Quiz attempts",
};

export default async function QuizAttemptsPage() {
  const viewer = await (await createProfileController()).currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const { attempts, performance } = await (await createQuizAttemptController()).history();

  return (
    <QuizAttemptHistoryView
      viewer={viewer}
      attempts={attempts}
      performance={performance}
      signOutAction={signOutAction}
    />
  );
}
