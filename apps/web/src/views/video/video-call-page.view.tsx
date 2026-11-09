import type { ReactNode } from "react";

import { createStudentNavigation } from "@/models/home/home.model";
import type { Viewer } from "@/models/profile/profile.model";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface VideoCallPageViewProps {
  readonly viewer: Viewer;
  readonly signOutAction: () => Promise<void>;
  /** The call screen, assembled by the route. */
  readonly children: ReactNode;
}

export function VideoCallPageView({ viewer, signOutAction, children }: VideoCallPageViewProps) {
  return (
    <main className="student-app call-app">
      <StudentTopbar
        navigation={createStudentNavigation("Chats")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        signOutAction={signOutAction}
      />
      <div className="call-shell">{children}</div>
    </main>
  );
}
