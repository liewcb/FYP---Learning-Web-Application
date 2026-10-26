import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  analyseContentAction,
  uploadDocumentAction,
} from "@/app/documents/actions";
import {
  createDocumentController,
  createProfileController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { DocumentsView } from "@/views/documents/documents.view";

export const metadata: Metadata = {
  title: "Content analysis",
};

export default async function DocumentsPage() {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const controller = await createDocumentController();
  const documents = await controller.listAndResumeProcessing();

  return (
    <DocumentsView
      viewer={viewer}
      documents={documents.map((document) => document.data)}
      awaitingExtraction={documents.some((document) =>
        document.isAwaitingExtraction(),
      )}
      uploadAction={uploadDocumentAction}
      analysisAction={analyseContentAction}
      signOutAction={signOutAction}
    />
  );
}
