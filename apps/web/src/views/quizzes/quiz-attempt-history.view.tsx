import Link from "next/link";

import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import {
  formatAttemptDuration,
  type QuizAttemptSummary,
  type QuizPerformanceSummary,
} from "@/models/quiz/quiz-attempt.model";
import { formatAttemptDate, scoreTone } from "@/views/quizzes/quiz-display";
import { QuizTabs } from "@/views/quizzes/quiz-tabs.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface QuizAttemptHistoryViewProps {
  readonly viewer: Viewer;
  readonly attempts: readonly QuizAttemptSummary[];
  readonly performance: QuizPerformanceSummary;
  readonly signOutAction: () => Promise<void>;
}

function trendLabel(trend: number | null): string {
  if (trend === null) return "First attempt recorded";
  if (trend === 0) return "Same as your previous attempt";
  return trend > 0
    ? `Up ${trend} points on your previous attempt`
    : `Down ${Math.abs(trend)} points on your previous attempt`;
}

export function QuizAttemptHistoryView({
  viewer,
  attempts,
  performance,
  signOutAction,
}: QuizAttemptHistoryViewProps) {
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
            <h1>Quiz history</h1>
            <p>
              Your graded quizzes. Review answers and track your progress.
            </p>
          </div>
          <Link className="button button-outline" href="/quizzes">
            Practise a quiz <span aria-hidden="true">→</span>
          </Link>
        </header>

        <QuizTabs active="history" attemptCount={performance.attemptCount} />

        <section className="quiz-summary-strip attempt-stats" aria-label="Performance summary">
          <div>
            <span>Attempts</span>
            <strong>{performance.attemptCount}</strong>
            <small>across {performance.quizCount} quiz{performance.quizCount === 1 ? "" : "zes"}</small>
          </div>
          <div>
            <span>Average score</span>
            <strong>{performance.attemptCount ? `${performance.averagePercentage}%` : "—"}</strong>
            <small>All recorded attempts</small>
          </div>
          <div>
            <span>Best score</span>
            <strong>{performance.attemptCount ? `${performance.bestPercentage}%` : "—"}</strong>
            <small>Your highest result</small>
          </div>
          <div>
            <span>Latest score</span>
            <strong>
              {performance.latestPercentage === null ? "—" : `${performance.latestPercentage}%`}
            </strong>
            <small>{performance.attemptCount ? trendLabel(performance.trend) : "No attempts yet"}</small>
          </div>
        </section>

        <section className="module-card attempt-history-card" aria-labelledby="attempts-title">
          <div className="module-card-heading">
            <span className="module-icon blue" aria-hidden="true">☰</span>
            <div>
              <h2 id="attempts-title">Attempts</h2>
            </div>
          </div>

          {attempts.length > 0 ? (
            <ul className="attempt-list">
              {attempts.map((attempt) => (
                <li key={attempt.id}>
                  <div className={`attempt-score ${scoreTone(attempt.percentage)}`}>
                    <strong>{attempt.percentage}%</strong>
                    <span>{attempt.score}/{attempt.maxScore}</span>
                  </div>
                  <div className="attempt-main">
                    <strong>{attempt.quizTitle}</strong>
                    <span>
                      {formatAttemptDate(attempt.submittedAt)} · {attempt.difficulty} ·{" "}
                      {formatAttemptDuration(attempt.startedAt, attempt.submittedAt)}
                    </span>
                    <div
                      className="attempt-bar"
                      role="img"
                      aria-label={`${attempt.percentage} percent`}
                    >
                      <span style={{ width: `${attempt.percentage}%` }} />
                    </div>
                  </div>
                  <div className="attempt-actions">
                    <Link href={`/quizzes/attempts/${attempt.id}`}>Review</Link>
                    <Link href={`/quizzes?quizId=${attempt.quizId}`}>Retake</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="document-empty">
              <span aria-hidden="true">?</span>
              <strong>No attempts yet</strong>
              <p>
                Submit a quiz made from a document to see your score here.
              </p>
              <Link className="text-action" href="/quizzes">
                Go to quizzes <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
