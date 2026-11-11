import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { generateQuizAction, submitQuizAttemptAction } from "@/app/quizzes/actions";
import {
  createDocumentController,
  createLearningResultsController,
  createProfileController,
  createQuizAttemptController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import type { DocumentStudySource } from "@/models/document/document.model";
import type { SavedQuiz } from "@/models/quiz/quiz.model";
import type { QuizAttemptSummary } from "@/models/quiz/quiz-attempt.model";
import { QuizzesView } from "@/views/quizzes/quizzes.view";

export const metadata: Metadata = {
  title: "Quiz generator",
};

interface QuizzesPageProps {
  readonly searchParams: Promise<{ documentId?: string | string[]; quizId?: string | string[] }>;
}

function parseDocumentId(value: string | string[] | undefined): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function QuizzesPage({ searchParams }: QuizzesPageProps) {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const params = await searchParams;
  const requestedDocumentId = parseDocumentId(params.documentId);
  const requestedQuizId = parseDocumentId(params.quizId);
  const learningResults = await createLearningResultsController();
  const attempts = await createQuizAttemptController();
  const [savedQuizzes, selectedQuiz, selectedQuizAttempts, history] = await Promise.all([
    learningResults.savedQuizzes(),
    requestedQuizId ? learningResults.savedQuiz(requestedQuizId) : Promise.resolve<SavedQuiz | null>(null),
    requestedQuizId
      ? attempts.forQuiz(requestedQuizId)
      : Promise.resolve<QuizAttemptSummary[]>([]),
    attempts.history(),
  ]);
  let quizSource: DocumentStudySource | null = null;
  let sourceNotice: string | undefined;

  if (requestedDocumentId) {
    const documents = await createDocumentController();
    const document = (await documents.list()).find(
      (item) => item.id === requestedDocumentId && item.status === "ready",
    );
    const content = document ? await documents.content(document.id) : null;

    if (document && content) {
      quizSource = {
        id: document.id,
        title: document.title,
        fileName: document.fileName,
        text: content.sentences.join("\n"),
        sentenceCount: content.sentenceCount,
      };
    } else {
      sourceNotice =
        "That upload is not ready for quizzes yet. Open My Documents and wait until its status is Ready.";
    }
  }

  return (
    <QuizzesView
      viewer={viewer}
      generateAction={generateQuizAction}
      signOutAction={signOutAction}
      source={quizSource}
      sourceNotice={sourceNotice}
      savedQuizzes={savedQuizzes}
      selectedQuiz={selectedQuiz}
      selectedQuizAttempts={selectedQuizAttempts}
      attemptCount={history.performance.attemptCount}
      submitAttemptAction={submitQuizAttemptAction}
    />
  );
}
