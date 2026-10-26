import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  deleteDocumentAction,
  processDocumentAction,
  renameDocumentAction,
} from "@/app/documents/actions";
import {
  createDocumentController,
  createProfileController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { DocumentManagerView } from "@/views/documents/document-manager.view";

export const metadata: Metadata = {
  title: "Manage documents",
};

export default async function ManageDocumentsPage() {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const controller = await createDocumentController();
  const documents = await controller.listForManagement();

  return (
    <DocumentManagerView
      viewer={viewer}
      documents={documents}
      processAction={processDocumentAction}
      renameAction={renameDocumentAction}
      deleteAction={deleteDocumentAction}
      signOutAction={signOutAction}
    />
  );
}
