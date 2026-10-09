import type { ReactNode } from "react";

interface AuthShellProps {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
  /** Optional back link or button shown above the title. */
  readonly back?: ReactNode;
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  back,
}: AuthShellProps) {
  return (
    <main className="auth-page">
      <section className="auth-intro" aria-hidden="true">
        <div className="brand">
          <span className="brand-mark">L</span>
          <span>LearnTogether</span>
        </div>
        <div className="auth-intro-copy">
          <p className="eyebrow">AI-powered collaborative learning</p>
          <h2>Understand your notes faster, and learn together.</h2>
          <ul>
            <li>Summaries and key concepts from your lecture notes</li>
            <li>Quizzes generated from your own materials</li>
            <li>Study groups, forums and a verified library</li>
          </ul>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          {back ? <div className="auth-back">{back}</div> : null}
          <div className="brand auth-card-brand">
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            <span>LearnTogether</span>
          </div>
          <h1>{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
          <p className="auth-footer">{footer}</p>
        </div>
      </section>
    </main>
  );
}
