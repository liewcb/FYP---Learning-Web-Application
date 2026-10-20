import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { generateQuizAction } from "@/app/quizzes/actions";
import { createProfileController } from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { QuizzesView } from "@/views/quizzes/quizzes.view";

export const metadata: Metadata = {
  title: "Quiz generator",
};

export default async function QuizzesPage() {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  return (
    <QuizzesView
      viewer={viewer}
      generateAction={generateQuizAction}
      signOutAction={signOutAction}
    />
  );
}
