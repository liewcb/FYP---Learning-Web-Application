"use client";

import Link from "next/link";
import { useActionState } from "react";

import type {
  QuizGenerationFormState,
  SavedQuiz,
  SavedQuizSummary,
} from "@/models/quiz/quiz.model";
import type { DocumentStudySource } from "@/models/document/document.model";
import { InteractiveQuizView } from "@/views/quizzes/interactive-quiz.view";

interface QuizBuilderViewProps {
  readonly source: DocumentStudySource | null;
  readonly sourceNotice?: string;
  readonly savedQuizzes: readonly SavedQuizSummary[];
  readonly selectedQuiz: SavedQuiz | null;
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

function SavedQuizView({ quiz }: { readonly quiz: SavedQuiz }) {
  return (
    <>
      <div className="result-heading">
        <div>
          <p className="section-kicker">Saved assessment</p>
          <h2>{quiz.title}</h2>
          <p>{quiz.questionCount} questions · {quiz.difficulty} difficulty</p>
        </div>
        <span className="status-chip ready">Saved</span>
      </div>

      <p className="saved-result-note">
        This is your saved question set. Generate a new quiz whenever you want fresh practice.
      </p>

      <ol className="saved-quiz-questions">
        {quiz.questions.map((question) => (
          <li key={question.id}>
            <span>Question {question.position}</span>
            <strong>{question.prompt}</strong>
            {question.options.length > 0 ? (
              <ul>
                {question.options.map((option) => <li key={option}>{option}</li>)}
              </ul>
            ) : <small>Short answer</small>}
          </li>
        ))}
      </ol>
    </>
  );
}

export function QuizBuilderView({
  action,
  source,
  sourceNotice,
  savedQuizzes,
  selectedQuiz,
}: QuizBuilderViewProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? {
    ...defaultValues,
    materialTitle: source?.title ?? "",
    text: source?.text ?? "",
  };
  const result = state.result;

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
            ? `Extracted sentences from “${source.title}” are loaded below. Gemini will generate questions grounded in that text.`
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

        <div className="form-field">
          <label htmlFor="quiz-text">Learning content</label>
          <textarea
            id="quiz-text"
            name="text"
            rows={12}
            defaultValue={values.text}
            maxLength={100_000}
            placeholder="Paste several complete sentences from your notes..."
            required
          />
          <p className="field-hint">
            {source
              ? "Review or edit the extracted text before generating the quiz."
              : "You can also choose a ready document from My Documents to fill this automatically."}
          </p>
        </div>

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

        {state.savedQuizId ? (
          <p className="saved-result-note">
            Quiz saved. <Link href={`/quizzes?quizId=${state.savedQuizId}`}>Open your saved copy</Link>
          </p>
        ) : null}
      </form>

      <section className="quiz-preview" aria-live="polite" aria-label="Generated quiz">
        {result ? (
          <InteractiveQuizView
            key={`${result.title}-${result.questions.map((question) => question.prompt).join("|")}`}
            quiz={result}
          />
        ) : selectedQuiz ? (
          <SavedQuizView quiz={selectedQuiz} />
        ) : (
          <div className="result-empty">
            <span aria-hidden="true">?</span>
            <h2>Your generated quiz will appear here</h2>
            <p>
              Choose the settings and learning material to create a grounded
              assessment. Answers remain hidden until you submit the quiz.
            </p>
          </div>
        )}

        {savedQuizzes.length > 0 ? (
          <section className="saved-quiz-history" aria-labelledby="saved-quizzes-title">
            <div>
              <p className="section-kicker">Your assessments</p>
              <h2 id="saved-quizzes-title">Saved quizzes</h2>
            </div>
            <ul>
              {savedQuizzes.map((quiz) => (
                <li key={quiz.id} className={selectedQuiz?.id === quiz.id ? "selected" : ""}>
                  <div>
                    <strong>{quiz.title}</strong>
                    <span>{quiz.questionCount} questions · {quiz.difficulty}</span>
                  </div>
                  <Link href={`/quizzes?quizId=${quiz.id}`}>View</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </div>
  );
}
