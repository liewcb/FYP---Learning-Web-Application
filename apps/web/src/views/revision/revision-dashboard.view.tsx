import { Source_Serif_4 } from "next/font/google";

import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import type { RevisionDashboardModel } from "@/models/revision/revision.model";
import { StudentTopbar } from "@/views/student/student-topbar.view";
import {
  RevisionWorkspace,
  type RevisionActions,
} from "@/views/revision/revision-workspace.view";

// A serif for long reading in the document reader; the interface stays in Sora.
const readingFont = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-reading",
  display: "swap",
});

interface RevisionDashboardViewProps {
  readonly viewer: Viewer;
  readonly model: RevisionDashboardModel;
  readonly actions: RevisionActions;
  readonly signOutAction: () => Promise<void>;
}

/** The student dashboard: a revision workspace for their own documents. */
export function RevisionDashboardView({
  viewer,
  model,
  actions,
  signOutAction,
}: RevisionDashboardViewProps) {
  return (
    <main className={`student-app rev-app ${readingFont.variable}`}>
      <StudentTopbar
        navigation={createStudentNavigation("Dashboard")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        avatarUrl={viewer.avatarUrl}
        signOutAction={signOutAction}
      />
      <div className="rev-shell">
        <RevisionWorkspace model={model} actions={actions} />
      </div>
    </main>
  );
}
