import {
  quizScoreMessage,
  type QuizReviewItem,
} from "@/models/quiz/quiz-attempt.model";
import type { QuizScore } from "@/models/quiz/quiz.model";

export const questionTypeLabels = {
  multiple_choice: "Multiple choice",
  true_false: "True / false",
  short_answer: "Short answer",
} as const;

export function QuizScoreSummary({ score }: { readonly score: QuizScore }) {
  const tone = score.percentage >= 70 ? "" : " needs-work";

  return (
    <div className={`quiz-score-summary${tone}`} role="status">
      <div className="quiz-score-value" aria-label={`${score.percentage} percent`}>
        <strong>{score.percentage}%</strong>
        <span>{score.correct}/{score.total} correct</span>
      </div>
      <div>
        <p className="section-kicker">Assessment result</p>
        <h3>{quizScoreMessage(score.percentage)}</h3>
      </div>
    </div>
  );
}

/** Read-only, graded view of every question in an attempt. */
export function QuizReviewList({ items }: { readonly items: readonly QuizReviewItem[] }) {
  return (
    <ol className="generated-question-list">
      {items.map((item) => (
        <li
          className={`generated-question ${item.isCorrect ? "is-correct" : "is-incorrect"}`}
          key={item.position}
        >
          <div className="question-heading">
            <span>Question {item.position}</span>
            <small>{questionTypeLabels[item.questionType]}</small>
          </div>
          <h3>{item.prompt}</h3>

          {item.options.length > 0 ? (
            <ul className="quiz-answer-options quiz-review-options">
              {item.options.map((option, index) => {
                const chosen = option === item.response;
                const correct = option === item.correctAnswer;

                return (
                  <li
                    className={`quiz-answer-option${chosen ? " is-selected" : ""}${
                      correct ? " is-correct" : ""
                    }${chosen && !correct ? " is-incorrect" : ""}`}
                    key={option}
                  >
                    <span className="option-letter" aria-hidden="true">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span>
                      {option}
                      {chosen ? <em className="quiz-review-tag">Your answer</em> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="quiz-review-response">
              <b>Your answer:</b> {item.response || <i>No answer</i>}
            </p>
          )}

          <div className={`quiz-answer-feedback ${item.isCorrect ? "is-correct" : "is-incorrect"}`}>
            <strong>{item.isCorrect ? "Correct" : "Not quite"}</strong>
            {!item.isCorrect ? (
              <p><b>Correct answer:</b> {item.correctAnswer}</p>
            ) : null}
            {item.explanation ? <p>{item.explanation}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
