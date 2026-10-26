import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  createDocumentController,
  createProfileController,
} from "@/lib/dependencies/server";
import { authRoutes } from "@/models/auth/auth-routes";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/documents/[id]/download">,
) {
  const profiles = await createProfileController();

  if (!(await profiles.currentViewer())) {
    redirect(authRoutes.signIn);
  }

  const { id } = await context.params;
  const documentId = Number(id);

  if (!Number.isSafeInteger(documentId) || documentId <= 0) {
    return new Response("Document not found.", { status: 404 });
  }

  const documents = await createDocumentController();
  const url = await documents.downloadUrl(documentId);

  if (!url) {
    return new Response("Document not found.", { status: 404 });
  }

  redirect(url);
}
