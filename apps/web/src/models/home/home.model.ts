export interface ModuleSummary {
  readonly title: string;
  readonly description: string;
}

export interface HomePageModel {
  readonly moduleGroups: readonly ModuleSummary[];
  readonly foundations: readonly string[];
}

export function createHomePageModel(): HomePageModel {
  return {
    moduleGroups: [
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
    ],
    foundations: [
      "Next.js web application",
      "Supabase authentication and data",
      "Private document storage",
      "FastAPI AI processing service",
    ],
  };
}
