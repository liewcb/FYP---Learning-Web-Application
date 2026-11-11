import Link from "next/link";

const quizTabs = [
  { key: "practise", label: "Generate & practise", href: "/quizzes" },
  { key: "history", label: "Attempt history", href: "/quizzes/attempts" },
] as const;

export type QuizTabKey = (typeof quizTabs)[number]["key"];

interface QuizTabsProps {
  readonly active: QuizTabKey;
  readonly attemptCount?: number;
}

export function QuizTabs({ active, attemptCount }: QuizTabsProps) {
  return (
    <nav className="page-tabs" aria-label="Quiz sections">
      {quizTabs.map((tab) => (
        <Link
          className={tab.key === active ? "page-tab active" : "page-tab"}
          href={tab.href}
          key={tab.key}
          aria-current={tab.key === active ? "page" : undefined}
        >
          {tab.label}
          {tab.key === "history" && attemptCount !== undefined ? (
            <span className="page-tab-count">{attemptCount}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
