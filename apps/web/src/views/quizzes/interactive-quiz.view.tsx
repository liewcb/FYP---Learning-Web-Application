"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import type {
  QuizAttemptOutcome,
  QuizAttemptQuestion,
  QuizAttemptResult,
} from "@/models/quiz/quiz-attempt.model";
import type { QuizAnswers } from "@/models/quiz/quiz.model";
import {
  QuizReviewList,
  QuizScoreSummary,
  questionTypeLabels,
} from "@/views/quizzes/quiz-review.view";

interface InteractiveQuizViewProps {
  readonly kicker: string;
  readonly title: string;
  readonly subtitle: string;
  readonly questions: readonly QuizAttemptQuestion[];
  /** Grades the answers, either locally or through a stored attempt. */
  readonly grade: (answers: QuizAnswers, startedAt: string) => Promise<QuizAttemptOutcome>;
  /** True when attempts are stored in the student's history. */
  readonly recordsAttempts: boolean;
  readonly footnote?: string;
}

function now(): string {
  return new Date().toISOString();
}

export function InteractiveQuizView({
  kicker,
  title,
  subtitle,
  questions,
  grade,
  recordsAttempts,
  footnote,
}: InteractiveQuizViewProps) {
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [startedAt, setStartedAt] = useState(now);
  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const answeredCount = questions.filter(
    (question) => (answers[question.position] ?? "").trim().length > 0,
  ).length;
  const allAnswered = answeredCount === questions.length;

  function answerQuestion(position: number, answer: string) {
    if (result || pending) {
      return;
    }

    setAnswers((current) => ({ ...current, [position]: answer }));
  }

  async function submitQuiz(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!allAnswered || pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const outcome = await grade(answers, startedAt);

      if (outcome.ok) {
        setResult(outcome.result);
        requestAnimationFrame(() =>
          topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      } else {
        setError(outcome.error);
      }
    } catch {
      setError("Your answers could not be submitted. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function retryQuiz() {
    setAnswers({});
    setResult(null);
    setError(null);
    setStartedAt(now());
    requestAnimationFrame(() =>
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  return (
    <>
      <div className="result-heading" ref={topRef}>
        <div>
          <p className="section-kicker">{kicker}</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className={`status-chip ${result ? "completed" : "ready"}`}>
          {result ? "Completed" : "In progress"}
        </span>
      </div>

      {result ? (
        <>
          <QuizScoreSummary score={result.score} />
          {result.attemptId ? (
            <p className="saved-result-note">
              Attempt saved to your history.{" "}
              <Link href={`/quizzes/attempts/${result.attemptId}`}>Open this review</Link>
              {" · "}
              <Link href="/quizzes/attempts">See all attempts</Link>
            </p>
          ) : !recordsAttempts ? (
            <p className="quiz-local-note">
              Quizzes made from pasted text are not saved. Generate from an
              uploaded document to keep your score history.
            </p>
          ) : null}
          <QuizReviewList items={result.items} />
          <div className="quiz-submit-bar">
            <p>Score: {result.score.correct} out of {result.score.total}</p>
            <button className="button button-outline" type="button" onClick={retryQuiz}>
              Try again
            </button>
          </div>
        </>
      ) : (
        <form className="interactive-quiz" onSubmit={submitQuiz}>
          <ol className="generated-question-list">
            {questions.map((question) => {
              const selectedAnswer = answers[question.position] ?? "";

              return (
                <li className="generated-question" key={question.position}>
                  <div className="question-heading">
                    <span>Question {question.position}</span>
                    <small>{questionTypeLabels[question.questionType]}</small>
                  </div>
                  <h3>{question.prompt}</h3>

                  {question.options.length > 0 ? (
                    <fieldset className="quiz-answer-options" disabled={pending}>
                      <legend className="visually-hidden">
                        Select an answer for question {question.position}
                      </legend>
                      {question.options.map((option, index) => (
                        <label
                          className={`quiz-answer-option${
                            selectedAnswer === option ? " is-selected" : ""
                          }`}
                          key={option}
                        >
                          <input
                            type="radio"
                            name={`question-${question.position}`}
                            value={option}
                            checked={selectedAnswer === option}
                            onChange={() => answerQuestion(question.position, option)}
                          />
                          <span className="option-letter" aria-hidden="true">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span>{option}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <div className="form-field quiz-short-answer">
                      <label htmlFor={`answer-${question.position}`}>Your answer</label>
                      <input
                        id={`answer-${question.position}`}
                        type="text"
                        value={selectedAnswer}
                        disabled={pending}
                        maxLength={1000}
                        placeholder="Type a short answer"
                        onChange={(event) =>
                          answerQuestion(question.position, event.target.value)
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {error ? <p className="form-alert" role="alert">{error}</p> : null}

          <div className="quiz-submit-bar">
            <p aria-live="polite">
              {answeredCount} of {questions.length} answered
              {recordsAttempts ? " · your score will be saved" : ""}
            </p>
            <button
              className="button button-dark"
              type="submit"
              disabled={!allAnswered || pending}
            >
              {pending ? "Checking..." : "Submit answers"}
            </button>
          </div>
        </form>
      )}

      {footnote ? <p className="model-note">{footnote}</p> : null}
    </>
  );
}
