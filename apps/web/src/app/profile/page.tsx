import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { removeAvatarAction, updateProfileAction, uploadAvatarAction } from "@/app/profile/actions";
import { createProfileController } from "@/lib/dependencies/server";
import { adminProfilePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { createStudentNavigation } from "@/models/home/home.model";
import { ProfileView } from "@/views/profile/profile.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

export const metadata: Metadata = {
  title: "My profile",
};

export default async function ProfilePage() {
  const controller = await createProfileController();
  const model = await controller.page();

  if (!model) {
    redirect(authRoutes.signIn);
  }

  if (model.viewer.role === "admin") {
    redirect(adminProfilePath);
  }

  return (
    <div className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation()}
        displayName={model.viewer.displayName}
        initials={model.viewer.initials}
        avatarUrl={model.viewer.avatarUrl}
        signOutAction={signOutAction}
      />
      <main className="app-shell page-content">
        <ProfileView
          model={model}
          updateAction={updateProfileAction}
          uploadAvatarAction={uploadAvatarAction}
          removeAvatarAction={removeAvatarAction}
        />
      </main>
    </div>
  );
}
