import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  createDocumentController,
  createLearningResultsController,
  createProfileController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { DocumentDetailView } from "@/views/documents/document-detail.view";

export const metadata: Metadata = {
  title: "Learning material",
};

interface DocumentDetailPageProps {
  readonly params: Promise<{ id: string }>;
}

function documentId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function DocumentDetailPage({ params }: DocumentDetailPageProps) {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const id = documentId((await params).id);

  if (id === null) {
    notFound();
  }

  const documents = await createDocumentController();
  let document;

  try {
    document = await documents.show(id);
  } catch {
    // The repository runs with the session cookie, so this also hides another
    // student's document as a regular not-found page.
    notFound();
  }

  const content = document.status === "ready" ? await documents.content(id) : null;
  const analysis = content
    ? await (await createLearningResultsController()).latestAnalysis(id)
    : null;

  return (
    <DocumentDetailView
      viewer={viewer}
      document={document.data}
      content={content}
      analysis={analysis}
      signOutAction={signOutAction}
    />
  );
}
