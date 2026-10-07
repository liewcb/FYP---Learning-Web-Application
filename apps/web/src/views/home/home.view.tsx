import type { HomePageModel } from "@/models/home/home.model";

interface HomeViewProps {
  model: HomePageModel;
}

export function HomeView({ model }: HomeViewProps) {
  return (
    <main className="student-app" id="home">
      <header className="topbar">
        <div className="app-shell topbar-inner">
          <a className="brand" href="#home" aria-label="LearnTogether AI home">
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            <span>LearnTogether</span>
          </a>

          <nav className="main-nav" aria-label="Student navigation">
            {model.navigation.map((item) => (
              <a
                className={item.active ? "nav-link active" : "nav-link"}
                href={item.href}
                key={item.label}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="account-actions">
            <button className="icon-button" type="button" aria-label="Notifications">
              <span className="notification-dot" />
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
              </svg>
            </button>
            <div className="student-avatar" aria-hidden="true">
              {model.student.initials}
            </div>
          </div>
        </div>
      </header>

      <div className="app-shell dashboard-content">
        <section className="welcome-panel" aria-labelledby="welcome-title">
          <div className="welcome-copy">
            <p className="eyebrow">Your learning workspace</p>
            <h1 id="welcome-title">Welcome back, {model.student.displayName}.</h1>
            <p>
              Keep your notes organised, understand difficult topics and learn
              together with your classmates.
            </p>
            <div className="welcome-actions">
              <a className="button button-light" href="#recent-learning">
                Continue learning
              </a>
              <a className="text-link" href="#quick-actions">
                Start something new <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          <div className="daily-focus" aria-label="Today's focus">
            <div className="focus-heading">
              <span>Today&apos;s focus</span>
              <span className="focus-badge">2 tasks</span>
            </div>
            <p className="focus-title">Review your generated quiz</p>
            <p className="focus-meta">Software Engineering · 10 questions</p>
            <div className="focus-progress" aria-label="Quiz preparation 70 percent">
              <span style={{ width: "70%" }} />
            </div>
          </div>
        </section>

        <section className="stats-grid" aria-label="Learning overview">
          {model.stats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.detail}</span>
            </article>
          ))}
        </section>

        <section className="dashboard-section" id="quick-actions">
          <div className="section-heading-row">
            <div>
              <p className="section-kicker">Quick actions</p>
              <h2>What would you like to do?</h2>
            </div>
          </div>

          <div className="quick-action-grid">
            {model.quickActions.map((action) => (
              <a
                className={`quick-action ${action.tone}`}
                href={action.href}
                key={action.title}
              >
                <span className="action-icon" aria-hidden="true">
                  {action.icon}
                </span>
                <span className="action-copy">
                  <strong>{action.title}</strong>
                  <span>{action.description}</span>
                </span>
                <span className="action-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            ))}
          </div>
        </section>

        <div className="dashboard-grid">
          <section
            className="dashboard-section learning-section"
            id="recent-learning"
            aria-labelledby="recent-learning-title"
          >
            <div className="section-heading-row">
              <div>
                <p className="section-kicker">My learning</p>
                <h2 id="recent-learning-title">Continue where you left off</h2>
              </div>
              <button className="quiet-button" type="button">
                View all
              </button>
            </div>

            <div className="material-list">
              {model.recentMaterials.map((material) => (
                <article className="material-row" key={material.title}>
                  <span
                    className="material-cover"
                    style={{ backgroundColor: material.color }}
                    aria-hidden="true"
                  >
                    {material.subject.slice(0, 1)}
                  </span>
                  <div className="material-details">
                    <div className="material-title-row">
                      <div>
                        <h3>{material.title}</h3>
                        <p>{material.subject}</p>
                      </div>
                      <span className="material-status">{material.status}</span>
                    </div>
                    <div className="material-progress-row">
                      <div className="material-progress" aria-hidden="true">
                        <span style={{ width: `${material.progress}%` }} />
                      </div>
                      <span>{material.updatedAt}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="dashboard-sidebar">
            <section className="side-card" id="study-group">
              <div className="side-card-heading">
                <p className="section-kicker">Next session</p>
                <span className="live-pill">Upcoming</span>
              </div>
              <div className="calendar-block" aria-hidden="true">
                <span>WED</span>
                <strong>14</strong>
              </div>
              <h2>{model.nextSession.title}</h2>
              <p>{model.nextSession.groupName}</p>
              <dl className="session-details">
                <div>
                  <dt>Time</dt>
                  <dd>
                    {model.nextSession.day}, {model.nextSession.time}
                  </dd>
                </div>
                <div>
                  <dt>People</dt>
                  <dd>{model.nextSession.attendeeCount} attending</dd>
                </div>
              </dl>
              <button className="button button-dark" type="button">
                View study group
              </button>
            </section>

            <section className="community-card" id="community">
              <span className="community-icon" aria-hidden="true">
                ◎
              </span>
              <div>
                <h2>Learn better together</h2>
                <p>Find students who are learning the same subjects as you.</p>
                <a href="#community">Explore the community →</a>
              </div>
            </section>
          </aside>
        </div>

        <p className="preview-note">
          Dashboard content is preview data. Authentication and live Supabase
          data are the next implementation step.
        </p>
      </div>
    </main>
  );
}
