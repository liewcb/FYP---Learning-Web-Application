export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly active?: boolean;
}

export const studentNavigationLabels = [
  "Dashboard",
  "My Documents",
  "Study Buddy",
  "Chats",
  "Quizzes",
  "Forum",
  "Library",
] as const;

export type StudentNavigationLabel = (typeof studentNavigationLabels)[number];

const studentNavigationHrefs: Record<StudentNavigationLabel, string> = {
  Dashboard: "/",
  "My Documents": "/documents",
  "Study Buddy": "/study-buddy",
  Chats: "/chats",
  Quizzes: "/quizzes",
  Forum: "/forum",
  Library: "/library",
};

export function createStudentNavigation(
  activeLabel?: StudentNavigationLabel,
): NavigationItem[] {
  return studentNavigationLabels.map((label) => ({
    label,
    href: studentNavigationHrefs[label],
    active: label === activeLabel,
  }));
}
