import type { StudyGuide } from "@/models/analysis/content-analysis.model";

interface StudyGuideViewProps {
  readonly guide: StudyGuide;
}

/**
 * Gemini study notes: an overview, one section per main idea in study order,
 * and a glossary. Each key point can be expanded to show the sentences from
 * the student's material that it is based on.
 */
export function StudyGuideView({ guide }: StudyGuideViewProps) {
  return (
    <div className="study-guide">
      {guide.overview ? <p className="study-guide-overview">{guide.overview}</p> : null}

      <nav className="study-guide-contents" aria-label="Study order">
        <h3>Study order</h3>
        <ol>
          {guide.sections.map((section, index) => (
            <li key={`${index}-${section.title}`}>
              <a href={`#study-section-${index + 1}`}>{section.title}</a>
            </li>
          ))}
        </ol>
      </nav>

      {guide.sections.map((section, index) => (
        <details
          key={`${index}-${section.title}`}
          id={`study-section-${index + 1}`}
          className="study-guide-section"
          open={index === 0}
        >
          <summary>
            <span className="study-guide-step" aria-hidden="true">{index + 1}</span>
            <span className="study-guide-title">
              <strong>{section.title}</strong>
              <small>
                {section.key_points.length} key{" "}
                {section.key_points.length === 1 ? "point" : "points"}
                {section.self_check.length > 0 ? " · self-check" : ""}
              </small>
            </span>
          </summary>

          <div className="study-guide-body">
            {section.summary ? <p className="study-guide-summary">{section.summary}</p> : null}

            <ul className="study-guide-points">
              {section.key_points.map((point) => (
                <li key={point.text}>
                  <p>{point.text}</p>
                  <details className="study-guide-source">
                    <summary>From your material</summary>
                    {point.sources.map((source) => (
                      <blockquote key={source.index}>{source.text}</blockquote>
                    ))}
                  </details>
                </li>
              ))}
            </ul>

            {section.key_terms.length > 0 ? (
              <div className="study-guide-terms">
                <h4>Terms to know</h4>
                <div className="concept-list">
                  {section.key_terms.map((term) => <span key={term}>{term}</span>)}
                </div>
              </div>
            ) : null}

            {section.self_check.length > 0 ? (
              <div className="study-guide-check">
                <h4>Check yourself</h4>
                {section.self_check.map((check) => (
                  <details key={check.question}>
                    <summary>{check.question}</summary>
                    <p>{check.answer}</p>
                  </details>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      ))}

      {guide.glossary.length > 0 ? (
        <section className="study-guide-glossary" aria-labelledby="study-glossary-title">
          <h3 id="study-glossary-title">Glossary</h3>
          <dl>
            {guide.glossary.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
