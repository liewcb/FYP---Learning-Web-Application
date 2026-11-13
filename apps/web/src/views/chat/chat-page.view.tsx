import type { ReactNode } from "react";

import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface ChatPageViewProps {
  readonly viewer: Viewer;
  readonly signOutAction: () => Promise<void>;
  /** The live chat workspace, assembled by the route. */
  readonly children: ReactNode;
}

export function ChatPageView({ viewer, signOutAction, children }: ChatPageViewProps) {
  return (
    <main className="student-app chat-app">
      <StudentTopbar
        navigation={createStudentNavigation("Chats")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        avatarUrl={viewer.avatarUrl}
        signOutAction={signOutAction}
      />
      <div className="chat-shell">{children}</div>
    </main>
  );
}
