"use client";

import Link from "next/link";
import { useActionState } from "react";

import type {
  QuizAnswers,
  QuizGenerationFormState,
  SavedQuiz,
  SavedQuizSummary,
} from "@/models/quiz/quiz.model";
import {
  gradeGeneratedQuizLocally,
  questionsFromGeneratedQuiz,
  type QuizAttemptOutcome,
  type QuizAttemptSummary,
} from "@/models/quiz/quiz-attempt.model";
import type { DocumentStudySource } from "@/models/document/document.model";
import { InteractiveQuizView } from "@/views/quizzes/interactive-quiz.view";
import { formatAttemptDate } from "@/views/quizzes/quiz-display";

export type SubmitQuizAttempt = (
  quizId: number,
  answers: Record<string, string>,
  startedAt: string | null,
) => Promise<QuizAttemptOutcome>;

interface QuizBuilderViewProps {
  readonly source: DocumentStudySource | null;
  readonly sourceNotice?: string;
  readonly savedQuizzes: readonly SavedQuizSummary[];
  readonly selectedQuiz: SavedQuiz | null;
  readonly selectedQuizAttempts: readonly QuizAttemptSummary[];
  readonly submitAttemptAction: SubmitQuizAttempt;
  readonly action: (
    state: QuizGenerationFormState,
    formData: FormData,
  ) => Promise<QuizGenerationFormState>;
}

const defaultValues = {
  materialTitle: "",
  text: "",
  questionCount: "3",
  difficulty: "mixed",
  questionTypes: ["multiple_choice", "true_false"],
};

const typeLabels = {
  multiple_choice: "Multiple choice",
  true_false: "True / false",
  short_answer: "Short answer",
} as const;

function toAnswerRecord(answers: QuizAnswers): Record<string, string> {
  return Object.fromEntries(
    Object.entries(answers).map(([position, answer]) => [position, answer]),
  );
}

function PastAttempts({ attempts }: { readonly attempts: readonly QuizAttemptSummary[] }) {
  if (attempts.length === 0) {
    return null;
  }

  return (
    <section className="saved-quiz-history" aria-labelledby="past-attempts-title">
      <div>
        <p className="section-kicker">This quiz</p>
        <h2 id="past-attempts-title">Your previous attempts</h2>
      </div>
      <ul>
        {attempts.map((attempt) => (
          <li key={attempt.id}>
            <div>
              <strong>{attempt.percentage}%</strong>
              <span>
                {attempt.score}/{attempt.maxScore} correct · {formatAttemptDate(attempt.submittedAt)}
              </span>
            </div>
            <Link href={`/quizzes/attempts/${attempt.id}`}>Review</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function QuizBuilderView({
  action,
  source,
  sourceNotice,
  savedQuizzes,
  selectedQuiz,
  selectedQuizAttempts,
  submitAttemptAction,
}: QuizBuilderViewProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? {
    ...defaultValues,
    materialTitle: source?.title ?? "",
    text: source?.text ?? "",
  };
  const result = state.result;
  const savedQuizId = state.savedQuizId;

  return (
    <div className="quiz-workspace">
      <form className="module-card quiz-builder-form" action={formAction} noValidate>
        <div className="module-card-heading">
          <span className="module-icon blue" aria-hidden="true">✦</span>
          <div>
            <p className="section-kicker">Quiz settings</p>
            <h2>Create a grounded assessment</h2>
          </div>
        </div>

        <p className="module-card-copy">
          {source
            ? `Questions will be generated from the text extracted from “${source.title}”. Long documents are handled automatically.`
            : "Choose a ready upload from My Documents or paste learning content. Gemini will ground questions in the supplied sentences."}
        </p>

        {sourceNotice ? (
          <p className="form-alert" role="alert">{sourceNotice}</p>
        ) : null}

        {source ? (
          <div className="document-source-callout">
            <strong>{source.title}</strong>
            <span>{source.fileName} · {source.sentenceCount} extracted sentences</span>
            <Link href="/documents">Choose another upload</Link>
          </div>
        ) : null}

        {source ? <input type="hidden" name="documentId" value={source.id} /> : null}

        {state.error ? (
          <p className="form-alert" role="alert">{state.error}</p>
        ) : null}

        <div className="form-field">
          <label htmlFor="material-title">Material title</label>
          <input
            id="material-title"
            name="materialTitle"
            defaultValue={values.materialTitle}
            maxLength={200}
            placeholder="e.g. Software Safety"
            required
          />
        </div>

        {source ? null : (
          <div className="form-field">
            <label htmlFor="quiz-text">Learning content</label>
            <textarea
              id="quiz-text"
              name="text"
              rows={10}
              defaultValue={values.text}
              maxLength={100_000}
              placeholder="Paste a few paragraphs from your notes..."
              required
            />
            <p className="field-hint">
              Or pick a Ready document from My Documents and choose
              &ldquo;Make a quiz&rdquo; &mdash; no copying needed.
            </p>
          </div>
        )}

        <div className="quiz-settings-grid">
          <div className="form-field">
            <label htmlFor="question-count">Questions</label>
            <input
              id="question-count"
              name="questionCount"
              type="number"
              min="1"
              max="20"
              defaultValue={values.questionCount}
            />
          </div>
          <div className="form-field">
            <label htmlFor="difficulty">Difficulty</label>
            <select id="difficulty" name="difficulty" defaultValue={values.difficulty}>
              <option value="mixed">Mixed</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        <fieldset className="quiz-type-fieldset">
          <legend>Question types</legend>
          {Object.entries(typeLabels).map(([type, label]) => (
            <label key={type}>
              <input
                type="checkbox"
                name="questionTypes"
                value={type}
                defaultChecked={values.questionTypes.includes(type)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        <button className="button button-dark" type="submit" disabled={pending}>
          {pending ? "Generating quiz..." : "Generate quiz"}
        </button>
        {pending ? (
          <p className="pending-note" role="status">
            Gemini can take a minute or longer when demand is high. Please do
            not submit the form again while it is working.
          </p>
        ) : null}

        {state.notice ? (
          <p className="quiz-local-note" role="status">{state.notice}</p>
        ) : null}

        {state.savedQuizId ? (
          <p className="saved-result-note">
            Quiz saved. <Link href={`/quizzes?quizId=${state.savedQuizId}`}>Open your saved copy</Link>
          </p>
        ) : null}
      </form>

      <section className="quiz-preview" aria-live="polite" aria-label="Generated quiz">
        {result ? (
          <InteractiveQuizView
            key={`${savedQuizId ?? "local"}-${result.questions.map((question) => question.prompt).join("|")}`}
            kicker="Generated assessment"
            title={result.title}
            subtitle={`${result.questions.length} questions · ${result.difficulty} difficulty`}
            questions={questionsFromGeneratedQuiz(result)}
            recordsAttempts={savedQuizId !== undefined}
            footnote={`Generated with ${result.model}`}
            grade={async (answers, startedAt) =>
              savedQuizId !== undefined
                ? submitAttemptAction(savedQuizId, toAnswerRecord(answers), startedAt)
                : { ok: true, result: gradeGeneratedQuizLocally(result, answers) }
            }
          />
        ) : selectedQuiz ? (
          <>
            <InteractiveQuizView
              key={selectedQuiz.id}
              kicker="Saved assessment"
              title={selectedQuiz.title}
              subtitle={`${selectedQuiz.questionCount} questions · ${selectedQuiz.difficulty} difficulty`}
              questions={selectedQuiz.questions}
              recordsAttempts
              grade={(answers, startedAt) =>
                submitAttemptAction(selectedQuiz.id, toAnswerRecord(answers), startedAt)
              }
            />
            <PastAttempts attempts={selectedQuizAttempts} />
          </>
        ) : (
          <div className="result-empty">
            <span aria-hidden="true">?</span>
            <h2>Your generated quiz will appear here</h2>
            <p>
              Choose the settings and learning material to create a grounded
              assessment, or pick a saved quiz below to practise again. Answers
              stay hidden until you submit.
            </p>
          </div>
        )}

        {savedQuizzes.length > 0 ? (
          <section className="saved-quiz-history" aria-labelledby="saved-quizzes-title">
            <div>
              <p className="section-kicker">Your assessments</p>
              <h2 id="saved-quizzes-title">Saved quizzes</h2>
              <Link className="text-action" href="/quizzes/attempts">
                Attempt history <span aria-hidden="true">→</span>
              </Link>
            </div>
            <ul>
              {savedQuizzes.map((quiz) => (
                <li key={quiz.id} className={selectedQuiz?.id === quiz.id ? "selected" : ""}>
                  <div>
                    <strong>{quiz.title}</strong>
                    <span>{quiz.questionCount} questions · {quiz.difficulty}</span>
                  </div>
                  <Link href={`/quizzes?quizId=${quiz.id}`}>
                    {selectedQuiz?.id === quiz.id ? "Open" : "Take quiz"}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </div>
  );
}
