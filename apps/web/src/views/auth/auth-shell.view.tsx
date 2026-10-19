import type { ReactNode } from "react";

import { BrandLogo } from "@/views/shared/brand-logo.view";
import { OwlMark } from "@/views/shared/owl-mark.view";

interface AuthShellProps {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
  /** Optional back link or button shown above the title. */
  readonly back?: ReactNode;
}

const highlights = ["AI summaries", "Auto quizzes", "Study groups", "Live video"];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  back,
}: AuthShellProps) {
  return (
    <main className="auth-page">
      <section className="auth-intro" aria-label="About Athenix">
        <BrandLogo tone="ivory" className="auth-intro-brand" />

        <div className="auth-intro-copy">
          <OwlMark tone="ivory" withPerch className="auth-hero-owl" />
          <h2>Wisdom, connected.</h2>
          <p>
            Upload your notes, let AI surface the key ideas, then study them
            with your peers — chat, share and meet on video, all in one place.
          </p>
        </div>

        <ul className="auth-highlights">
          {highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <BrandLogo className="auth-card-brand" />
          {back ? <div className="auth-back">{back}</div> : null}
          <h1>{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
          <p className="auth-footer">{footer}</p>
          <p className="auth-fineprint">Final Year Project · TAR UMT · 2026</p>
        </div>
      </section>
    </main>
  );
}
