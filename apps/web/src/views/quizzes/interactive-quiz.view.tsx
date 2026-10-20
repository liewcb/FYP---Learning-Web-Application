"use client";

import { useMemo, useRef, useState } from "react";

import {
  calculateQuizScore,
  isCorrectQuizAnswer,
  type GeneratedQuiz,
  type QuizAnswers,
} from "@/models/quiz/quiz.model";

const typeLabels = {
  multiple_choice: "Multiple choice",
  true_false: "True / false",
  short_answer: "Short answer",
} as const;

interface InteractiveQuizViewProps {
  readonly quiz: GeneratedQuiz;
}

function quizScoreMessage(percentage: number): string {
  if (percentage === 100) {
    return "Excellent work - every answer is correct.";
  }

  if (percentage >= 70) {
    return "Good work. Review the feedback for the questions you missed.";
  }

  return "Keep practising. Use the explanations below before trying again.";
}

export function InteractiveQuizView({ quiz }: InteractiveQuizViewProps) {
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [submitted, setSubmitted] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const answeredCount = quiz.questions.filter(
    (question) => (answers[question.position] ?? "").trim().length > 0,
  ).length;
  const allAnswered = answeredCount === quiz.questions.length;
  const score = useMemo(
    () => calculateQuizScore(quiz.questions, answers),
    [answers, quiz.questions],
  );

  function answerQuestion(position: number, answer: string) {
    if (submitted) {
      return;
    }

    setAnswers((current) => ({ ...current, [position]: answer }));
  }

  function submitQuiz(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!allAnswered) {
      return;
    }

    setSubmitted(true);
    requestAnimationFrame(() =>
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function retryQuiz() {
    setAnswers({});
    setSubmitted(false);
  }

  return (
    <>
      <div className="result-heading" ref={resultRef}>
        <div>
          <p className="section-kicker">Generated assessment</p>
          <h2>{quiz.title}</h2>
          <p>{quiz.questions.length} questions · {quiz.difficulty} difficulty</p>
        </div>
        <span className={`status-chip ${submitted ? "completed" : "ready"}`}>
          {submitted ? "Completed" : "Ready"}
        </span>
      </div>

      {submitted ? (
        <div className="quiz-score-summary" role="status">
          <div className="quiz-score-value" aria-label={`${score.percentage} percent`}>
            <strong>{score.percentage}%</strong>
            <span>{score.correct}/{score.total} correct</span>
          </div>
          <div>
            <p className="section-kicker">Assessment result</p>
            <h3>{quizScoreMessage(score.percentage)}</h3>
          </div>
        </div>
      ) : null}

      <form className="interactive-quiz" onSubmit={submitQuiz}>
        <ol className="generated-question-list">
          {quiz.questions.map((question) => {
            const selectedAnswer = answers[question.position] ?? "";
            const isCorrect = isCorrectQuizAnswer(question, selectedAnswer);

            return (
              <li
                className={`generated-question${
                  submitted ? (isCorrect ? " is-correct" : " is-incorrect") : ""
                }`}
                key={question.position}
              >
                <div className="question-heading">
                  <span>Question {question.position}</span>
                  <small>{typeLabels[question.question_type]}</small>
                </div>
                <h3>{question.prompt}</h3>

                {question.options.length > 0 ? (
                  <fieldset className="quiz-answer-options">
                    <legend className="visually-hidden">
                      Select an answer for question {question.position}
                    </legend>
                    {question.options.map((option, index) => {
                      const selected = selectedAnswer === option;
                      const correctOption = submitted && option === question.correct_answer;
                      const incorrectOption = submitted && selected && !correctOption;

                      return (
                        <label
                          className={`quiz-answer-option${selected ? " is-selected" : ""}${
                            correctOption ? " is-correct" : ""
                          }${incorrectOption ? " is-incorrect" : ""}`}
                          key={option}
                        >
                          <input
                            type="radio"
                            name={`question-${question.position}`}
                            value={option}
                            checked={selected}
                            disabled={submitted}
                            onChange={() => answerQuestion(question.position, option)}
                          />
                          <span className="option-letter" aria-hidden="true">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                ) : (
                  <div className="form-field quiz-short-answer">
                    <label htmlFor={`answer-${question.position}`}>Your answer</label>
                    <input
                      id={`answer-${question.position}`}
                      type="text"
                      value={selectedAnswer}
                      disabled={submitted}
                      placeholder="Type a short answer"
                      onChange={(event) =>
                        answerQuestion(question.position, event.target.value)
                      }
                    />
                  </div>
                )}

                {submitted ? (
                  <div
                    className={`quiz-answer-feedback ${
                      isCorrect ? "is-correct" : "is-incorrect"
                    }`}
                  >
                    <strong>{isCorrect ? "Correct" : "Not quite"}</strong>
                    {!isCorrect ? (
                      <p><b>Correct answer:</b> {question.correct_answer}</p>
                    ) : null}
                    <p>{question.explanation}</p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="quiz-submit-bar">
          <p aria-live="polite">
            {submitted
              ? `Score: ${score.correct} out of ${score.total}`
              : `${answeredCount} of ${quiz.questions.length} answered`}
          </p>
          {submitted ? (
            <button className="button button-outline" type="button" onClick={retryQuiz}>
              Try again
            </button>
          ) : (
            <button className="button button-dark" type="submit" disabled={!allAnswered}>
              Check answers
            </button>
          )}
        </div>
      </form>

      <p className="model-note">Generated with {quiz.model}</p>
    </>
  );
}
