import Link from "next/link";

import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import type { QuizGenerationFormState } from "@/models/quiz/quiz.model";
import { QuizBuilderView } from "@/views/quizzes/quiz-builder.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface QuizzesViewProps {
  readonly viewer: Viewer;
  readonly generateAction: (
    state: QuizGenerationFormState,
    formData: FormData,
  ) => Promise<QuizGenerationFormState>;
  readonly signOutAction: () => Promise<void>;
}

export function QuizzesView({
  viewer,
  generateAction,
  signOutAction,
}: QuizzesViewProps) {
  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation("Quizzes")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content">
        <header className="module-page-header">
          <div>
            <p className="section-kicker">Quiz &amp; Assessment Generation Module</p>
            <h1>Turn understood content into active practice.</h1>
            <p>
              Configure a focused assessment, answer every question and review
              immediate grounded feedback. Saved attempts will be connected later.
            </p>
          </div>
          <Link className="button button-outline" href="/documents">
            <span aria-hidden="true">←</span> Content analysis
          </Link>
        </header>

        <section className="quiz-summary-strip" aria-label="Quiz workflow status">
          <div>
            <span>Source</span>
            <strong>Preprocessed sentences</strong>
          </div>
          <div>
            <span>Generator</span>
            <strong>Gemini structured output</strong>
          </div>
          <div>
            <span>Validation</span>
            <strong>Type, answers and grounding</strong>
          </div>
        </section>

        <QuizBuilderView action={generateAction} />
      </div>
    </main>
  );
}
