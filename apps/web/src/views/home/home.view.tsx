import type { HomePageModel } from "@/models/home/home.model";

interface HomeViewProps {
  model: HomePageModel;
}

export function HomeView({ model }: HomeViewProps) {
  return (
    <main>
      <section className="hero">
        <nav className="nav shell" aria-label="Primary navigation">
          <span className="brand">LearnTogether AI</span>
          <span className="status">MVC foundation ready</span>
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
          {model.moduleGroups.map((group, index) => (
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
            {model.foundations.map((foundation) => (
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
