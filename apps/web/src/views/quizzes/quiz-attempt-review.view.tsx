import Link from "next/link";

import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import {
  formatAttemptDuration,
  scoreFromItems,
  type QuizAttemptReview,
} from "@/models/quiz/quiz-attempt.model";
import { formatAttemptDate } from "@/views/quizzes/quiz-display";
import { QuizReviewList, QuizScoreSummary } from "@/views/quizzes/quiz-review.view";
import { QuizTabs } from "@/views/quizzes/quiz-tabs.view";
import { StudyRecommendationView } from "@/views/quizzes/study-recommendation.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface QuizAttemptReviewViewProps {
  readonly viewer: Viewer;
  readonly review: QuizAttemptReview;
  readonly signOutAction: () => Promise<void>;
}

export function QuizAttemptReviewView({
  viewer,
  review,
  signOutAction,
}: QuizAttemptReviewViewProps) {
  const { attempt, items } = review;

  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation("Quizzes")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        avatarUrl={viewer.avatarUrl}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content">
        <header className="module-page-header">
          <div>
            <p className="section-kicker">Attempt review</p>
            <h1>{attempt.quizTitle}</h1>
            <p>
              Submitted {formatAttemptDate(attempt.submittedAt)} · {attempt.difficulty} difficulty ·
              time taken {formatAttemptDuration(attempt.startedAt, attempt.submittedAt)}
            </p>
          </div>
          <Link className="button button-outline" href={`/quizzes?quizId=${attempt.quizId}`}>
            Retake this quiz <span aria-hidden="true">→</span>
          </Link>
        </header>

        <QuizTabs active="history" />

        <section className="quiz-preview attempt-review" aria-label="Graded answers">
          <Link className="text-action attempt-back" href="/quizzes/attempts">
            <span aria-hidden="true">←</span> All attempts
          </Link>
          <QuizScoreSummary score={scoreFromItems(items)} />
          {review.recommendation ? (
            <StudyRecommendationView recommendation={review.recommendation} />
          ) : null}
          <QuizReviewList items={items} />
        </section>
      </div>
    </main>
  );
}
