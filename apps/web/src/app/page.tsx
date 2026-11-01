import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  analyseRevisionDocumentAction,
  createNoteAction,
  createSubjectAction,
  deleteNoteAction,
  deleteSubjectAction,
  moveDocumentToSubjectAction,
  openRevisionDocumentAction,
  recordReadingProgressAction,
  renameSubjectAction,
  setHighlightAction,
  updateNoteAction,
} from "@/app/revision/actions";
import {
  createProfileController,
  createRevisionController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { parseRevisionId } from "@/models/revision/revision.model";
import type { RevisionActions } from "@/views/revision/revision-workspace.view";
import { RevisionDashboardView } from "@/views/revision/revision-dashboard.view";

export const metadata: Metadata = {
  title: "Dashboard",
};

const actions: RevisionActions = {
  openDocument: openRevisionDocumentAction,
  createSubject: createSubjectAction,
  renameSubject: renameSubjectAction,
  deleteSubject: deleteSubjectAction,
  moveDocument: moveDocumentToSubjectAction,
  createNote: createNoteAction,
  updateNote: updateNoteAction,
  deleteNote: deleteNoteAction,
  setHighlight: setHighlightAction,
  recordProgress: recordReadingProgressAction,
  analyse: analyseRevisionDocumentAction,
};

interface HomeProps {
  readonly searchParams: Promise<{ doc?: string | string[] }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  // The proxy already redirects guests; this guards against a stale session.
  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const params = await searchParams;
  const controller = await createRevisionController();
  const model = await controller.loadDashboard({
    viewerName: viewer.displayName,
    documentId: typeof params.doc === "string" ? parseRevisionId(params.doc) : null,
  });

  return (
    <RevisionDashboardView
      viewer={viewer}
      model={model}
      actions={actions}
      signOutAction={signOutAction}
    />
  );
}
