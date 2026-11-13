"use client";

import { useEffect, useState } from "react";

import type { SavedContentAnalysis } from "@/models/analysis/content-analysis.model";
import type { QuizAttemptOutcome } from "@/models/quiz/quiz-attempt.model";
import { toAnswerRecord, type SavedQuiz } from "@/models/quiz/quiz.model";
import { revisionTimeZone, type RevisionActionState } from "@/models/revision/revision.model";
import { SavedAnalysisResults } from "@/views/analysis/saved-analysis-results.view";
import { InteractiveQuizView } from "@/views/quizzes/interactive-quiz.view";
import { RevisionDialog } from "@/views/revision/revision-dialog.view";

type Loaded<T> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "error"; readonly message: string };

const loadFailed = "This could not be loaded. Please try again.";

const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: revisionTimeZone,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Loads one saved item when a dialog opens. `load` must be stable (an action). */
function useSavedItem<T>(id: number, load: (id: number) => Promise<RevisionActionState<T>>): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    load(id)
      .then((result) => {
        if (!cancelled) {
          setState(
            result.value !== undefined
              ? { status: "ready", value: result.value }
              : { status: "error", message: result.error ?? loadFailed },
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error", message: loadFailed });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, load]);

  return state;
}

function DialogHeader({
  id,
  kicker,
  title,
  detail,
  onClose,
}: {
  readonly id: string;
  readonly kicker: string;
  readonly title: string;
  readonly detail?: string;
  readonly onClose: () => void;
}) {
  return (
    <header className="rev-study-dialog-header">
      <div>
        <p className="section-kicker">{kicker}</p>
        <h2 id={id}>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </div>
      <button className="buddy-dialog-close" type="button" onClick={onClose} aria-label="Close">
        ×
      </button>
    </header>
  );
}

/** Reads a document's saved content analysis without leaving the dashboard. */
export function SavedAnalysisDialog({
  documentId,
  documentTitle,
  load,
  onSentence,
  onClose,
}: {
  readonly documentId: number;
  readonly documentTitle: string;
  readonly load: (documentId: number) => Promise<RevisionActionState<SavedContentAnalysis>>;
  /** Closes the dialog and shows that sentence in the reader. */
  readonly onSentence: (sentenceIndex: number) => void;
  readonly onClose: () => void;
}) {
  const analysis = useSavedItem(documentId, load);

  return (
    <RevisionDialog open wide labelledBy="saved-analysis-dialog-title" onClose={onClose}>
      <div className="rev-study-dialog">
        <DialogHeader
          id="saved-analysis-dialog-title"
          kicker="Saved analysis"
          title={documentTitle}
          detail={
            analysis.status === "ready"
              ? `Analysed ${dateFormatter.format(new Date(analysis.value.completedAt))} · click a key sentence to read it in context`
              : undefined
          }
          onClose={onClose}
        />
        {analysis.status === "loading" ? <p className="rev-tool-note">Loading the analysis…</p> : null}
        {analysis.status === "error" ? <p className="field-error" role="alert">{analysis.message}</p> : null}
        {analysis.status === "ready" ? (
          <SavedAnalysisResults result={analysis.value.result} onSentence={onSentence} />
        ) : null}
      </div>
    </RevisionDialog>
  );
}

/** Takes a saved quiz without leaving the dashboard; the attempt is recorded as usual. */
export function SavedQuizDialog({
  quizId,
  load,
  submit,
  onClose,
}: {
  readonly quizId: number;
  readonly load: (quizId: number) => Promise<RevisionActionState<SavedQuiz>>;
  readonly submit: (
    quizId: number,
    answers: Record<string, string>,
    startedAt: string | null,
  ) => Promise<QuizAttemptOutcome>;
  /** `attempted` is true once an attempt was graded, so the scores can refresh. */
  readonly onClose: (attempted: boolean) => void;
}) {
  const quiz = useSavedItem(quizId, load);
  const [attempted, setAttempted] = useState(false);
  const close = () => onClose(attempted);

  return (
    <RevisionDialog open wide labelledBy="saved-quiz-dialog-title" onClose={close}>
      <div className="rev-study-dialog">
        <DialogHeader
          id="saved-quiz-dialog-title"
          kicker="Practice quiz"
          title={quiz.status === "ready" ? quiz.value.title : "Saved quiz"}
          onClose={close}
        />
        {quiz.status === "loading" ? <p className="rev-tool-note">Loading the quiz…</p> : null}
        {quiz.status === "error" ? <p className="field-error" role="alert">{quiz.message}</p> : null}
        {quiz.status === "ready" ? (
          <InteractiveQuizView
            kicker="Saved assessment"
            title={quiz.value.title}
            subtitle={`${quiz.value.questionCount} questions · ${quiz.value.difficulty} difficulty`}
            questions={quiz.value.questions}
            recordsAttempts
            grade={async (answers, startedAt) => {
              const outcome = await submit(quiz.value.id, toAnswerRecord(answers), startedAt);

              if (outcome.ok) {
                setAttempted(true);
              }

              return outcome;
            }}
          />
        ) : null}
      </div>
    </RevisionDialog>
  );
}
