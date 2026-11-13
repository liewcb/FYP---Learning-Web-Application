import Link from "next/link";

import { createStudentNavigation } from "@/models/home/home.model";
import type {
  LibrarySubmitFormState,
  LibrarySubmitPageModel,
} from "@/models/library/library.model";
import type { Viewer } from "@/models/profile/profile.model";
import { SubmitMaterialForm } from "@/views/library/submit-material-form.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface LibrarySubmitPageViewProps {
  readonly viewer: Viewer;
  readonly model: LibrarySubmitPageModel;
  readonly action: (
    state: LibrarySubmitFormState,
    formData: FormData,
  ) => Promise<LibrarySubmitFormState>;
  readonly signOutAction: () => Promise<void>;
}

export function LibrarySubmitPageView({
  viewer,
  model,
  action,
  signOutAction,
}: LibrarySubmitPageViewProps) {
  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation("Library")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        avatarUrl={viewer.avatarUrl}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content lib-submit-page">
        <Link className="text-action" href="/library">
          <span aria-hidden="true">←</span> Library
        </Link>

        {model.documents.length > 0 ? (
          <SubmitMaterialForm
            documents={model.documents}
            selectedId={model.selectedId}
            subjects={model.subjects}
            action={action}
          />
        ) : (
          <div className="module-card">
            <div className="document-empty">
              <span aria-hidden="true">□</span>
              <strong>No documents available to share</strong>
              <p>
                Only Ready documents can be submitted, and each one only once.
              </p>
              <Link className="button button-dark" href="/documents">
                Go to My Documents
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}