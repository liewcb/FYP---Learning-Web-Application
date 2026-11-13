import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  analyseContentAction,
  uploadDocumentAction,
} from "@/app/documents/actions";
import { ConnectedDocumentViewers } from "@/app/documents/connected-document-viewers";
import {
  createDocumentController,
  createLearningResultsController,
  createProfileController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import type {
  SavedContentAnalysis,
} from "@/models/analysis/content-analysis.model";
import type {
  DocumentStudySource,
  DocumentStudySourceOption,
} from "@/models/document/document.model";
import { DocumentsView } from "@/views/documents/documents.view";

export const metadata: Metadata = {
  title: "Content analysis",
};

interface DocumentsPageProps {
  readonly searchParams: Promise<{ documentId?: string | string[] }>;
}

function parseDocumentId(value: string | string[] | undefined): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const controller = await createDocumentController();
  const learningResults = await createLearningResultsController();
  const documents = await controller.listAndResumeProcessing();
  const availableAnalysisSources: DocumentStudySourceOption[] = documents
    .filter((document) => document.status === "ready" && document.content)
    .map((document) => ({
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      sentenceCount: document.content?.sentenceCount ?? 0,
    }));
  const params = await searchParams;
  const requestedDocumentId = parseDocumentId(params.documentId);
  const selectedDocument = documents.find(
    (document) => document.id === requestedDocumentId && document.status === "ready",
  );
  let analysisSource: DocumentStudySource | null = null;
  let savedAnalysis: SavedContentAnalysis | null = null;

  if (selectedDocument) {
    const content = await controller.content(selectedDocument.id);

    if (content) {
      analysisSource = {
        id: selectedDocument.id,
        title: selectedDocument.title,
        fileName: selectedDocument.fileName,
        text: content.sentences.join("\n"),
        sentenceCount: content.sentenceCount,
      };
      savedAnalysis = await learningResults.latestAnalysis(selectedDocument.id);
    }
  }

  return (
    <ConnectedDocumentViewers>
      <DocumentsView
        viewer={viewer}
        documents={documents.map((document) => document.data)}
        awaitingExtraction={documents.some((document) =>
          document.isAwaitingExtraction(),
        )}
        analysisSource={analysisSource}
        savedAnalysis={savedAnalysis}
        availableAnalysisSources={availableAnalysisSources}
        uploadAction={uploadDocumentAction}
        analysisAction={analyseContentAction}
        signOutAction={signOutAction}
      />
    </ConnectedDocumentViewers>
  );
}
