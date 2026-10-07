const moduleGroups = [
  {
    title: "Learn intelligently",
    description:
      "Upload learning materials, extract key ideas, generate quizzes and review study recommendations.",
  },
  {
    title: "Collaborate with peers",
    description:
      "Connect with classmates, form study groups, chat and join focused video sessions.",
  },
  {
    title: "Share trusted resources",
    description:
      "Discuss academic topics and contribute materials through an administrator-reviewed library.",
  },
];

const foundations = [
  "Next.js web application",
  "Supabase authentication and data",
  "Private document storage",
  "FastAPI AI processing service",
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <nav className="nav shell" aria-label="Primary navigation">
          <span className="brand">LearnTogether AI</span>
          <span className="status">Foundation ready</span>
        </nav>

        <div className="shell hero-content">
          <p className="eyebrow">SDG 4 · Quality Education</p>
          <h1>Turn study materials into shared understanding.</h1>
          <p className="hero-copy">
            One workspace for document analysis, self-assessment, academic
            discussion and real-time student collaboration.
          </p>

          <div className="actions">
            <a className="button primary" href="#modules">
              Explore modules
            </a>
            <a className="button secondary" href="/api/health">
              Check web service
            </a>
          </div>
        </div>
      </section>

      <section className="shell section" id="modules">
        <div className="section-heading">
          <p className="eyebrow">Project scope</p>
          <h2>A focused learning workflow, not another disconnected tool.</h2>
        </div>

        <div className="card-grid">
          {moduleGroups.map((group, index) => (
            <article className="card" key={group.title}>
              <span className="card-number">0{index + 1}</span>
              <h3>{group.title}</h3>
              <p>{group.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="foundation-section">
        <div className="shell foundation-grid">
          <div>
            <p className="eyebrow">Current milestone</p>
            <h2>The shared technical foundation is in place.</h2>
            <p className="muted">
              Development starts with an end-to-end flow from sign-in and file
              upload to analysis, quiz generation and stored results.
            </p>
          </div>

          <ul className="check-list">
            {foundations.map((foundation) => (
              <li key={foundation}>
                <span aria-hidden="true">✓</span>
                {foundation}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
