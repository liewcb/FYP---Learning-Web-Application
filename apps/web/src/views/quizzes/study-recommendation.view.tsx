import Link from "next/link";

import type { StudyRecommendation } from "@/models/quiz/study-recommendation.model";

const levelLabels = {
  mastered: "Mastered",
  on_track: "On track",
  needs_review: "Needs review",
} as const;

export function StudyRecommendationView({
  recommendation,
}: {
  readonly recommendation: StudyRecommendation;
}) {
  const { weakTopics, strongTopics, links } = recommendation;

  return (
    <section
      className={`study-rec ${recommendation.level}`}
      aria-labelledby="study-rec-title"
    >
      <div className="study-rec-heading">
        <div>
          <p className="section-kicker">Study recommendation</p>
          <h3 id="study-rec-title">{recommendation.headline}</h3>
          <p>{recommendation.summary}</p>
        </div>
        <span className="study-rec-level">{levelLabels[recommendation.level]}</span>
      </div>

      <ol className="study-rec-steps">
        {recommendation.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {weakTopics.length > 0 ? (
        <div className="study-rec-topics">
          <h4>Topics to revise</h4>
          {weakTopics.slice(0, 3).map((topic) => (
            <article key={topic.label}>
              <div className="study-rec-topic-head">
                <strong>{topic.label}</strong>
                <span>{topic.correct}/{topic.total} correct</span>
              </div>
              {topic.keySentences.length > 0 ? (
                <ul>
                  {topic.keySentences.map((sentence) => (
                    <li key={sentence}>{sentence}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {strongTopics.length > 0 ? (
        <p className="study-rec-strengths">
          <b>Strengths:</b>{" "}
          {strongTopics.slice(0, 4).map((topic) => (
            <span key={topic.label}>{topic.label}</span>
          ))}
        </p>
      ) : null}

      {links.revise || links.retake || links.newQuiz ? (
        <div className="study-rec-links">
          {links.revise ? (
            <Link className="button button-dark" href={links.revise}>Revise the material</Link>
          ) : null}
          {links.retake ? (
            <Link className="button button-outline" href={links.retake}>Retake this quiz</Link>
          ) : null}
          {links.newQuiz ? (
            <Link className="button button-outline" href={links.newQuiz}>New quiz on this document</Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
