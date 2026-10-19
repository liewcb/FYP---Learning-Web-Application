export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly active?: boolean;
}

export interface DashboardStat {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export interface QuickAction {
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly icon: string;
  readonly tone: "mint" | "blue" | "amber";
}

export interface LearningMaterialSummary {
  readonly title: string;
  readonly subject: string;
  readonly status: "Summary ready" | "Processing" | "Quiz ready";
  readonly updatedAt: string;
  readonly progress: number;
  readonly color: string;
}

export interface StudySessionSummary {
  readonly title: string;
  readonly groupName: string;
  readonly day: string;
  readonly time: string;
  readonly attendeeCount: number;
}

export interface HomePageModel {
  readonly student: {
    readonly displayName: string;
    readonly initials: string;
    readonly programme: string;
  };
  readonly navigation: readonly NavigationItem[];
  readonly stats: readonly DashboardStat[];
  readonly quickActions: readonly QuickAction[];
  readonly recentMaterials: readonly LearningMaterialSummary[];
  readonly nextSession: StudySessionSummary;
}

export type StudentSummary = HomePageModel["student"];

export const studentNavigationLabels = [
  "Dashboard",
  "My Documents",
  "Study Buddy",
  "Quizzes",
  "Forum",
  "Library",
] as const;

export type StudentNavigationLabel = (typeof studentNavigationLabels)[number];

const studentNavigationHrefs: Record<StudentNavigationLabel, string> = {
  Dashboard: "/",
  "My Documents": "/documents",
  "Study Buddy": "/study-buddy",
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

export function createHomePageModel(student: StudentSummary): HomePageModel {
  return {
    student,
    navigation: createStudentNavigation("Dashboard"),
    stats: [
      { label: "Learning materials", value: "12", detail: "+3 this week" },
      { label: "Quizzes completed", value: "7", detail: "2 ready to review" },
      { label: "Average score", value: "82%", detail: "+6% this month" },
    ],
    quickActions: [
      {
        title: "Upload study notes",
        description: "Add a PDF or DOCX file to your private learning space.",
        href: "#recent-learning",
        icon: "↑",
        tone: "mint",
      },
      {
        title: "Generate a quiz",
        description: "Turn your processed notes into a focused self-test.",
        href: "#recent-learning",
        icon: "✦",
        tone: "blue",
      },
      {
        title: "Find study partners",
        description: "Meet classmates working on similar topics and subjects.",
        href: "#community",
        icon: "◎",
        tone: "amber",
      },
    ],
    recentMaterials: [
      {
        title: "Software Engineering — Chapter 4",
        subject: "Software Engineering",
        status: "Summary ready",
        updatedAt: "Updated 18 minutes ago",
        progress: 78,
        color: "#2f8f70",
      },
      {
        title: "Research Methodology Notes",
        subject: "Final Year Project",
        status: "Processing",
        updatedAt: "Uploaded today",
        progress: 42,
        color: "#5475d6",
      },
      {
        title: "Database Systems — Week 5",
        subject: "Database Systems",
        status: "Quiz ready",
        updatedAt: "Updated yesterday",
        progress: 91,
        color: "#c47a3d",
      },
    ],
    nextSession: {
      title: "FYP research discussion",
      groupName: "Project Study Circle",
      day: "Wednesday",
      time: "8:00 PM",
      attendeeCount: 5,
    },
  };
}
