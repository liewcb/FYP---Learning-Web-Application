import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  createDocumentController,
  createProfileController,
} from "@/lib/dependencies/server";
import { authRoutes } from "@/models/auth/auth-routes";

/**
 * Opens one of the student's own files for the in-page viewer. Like
 * /download, but the link it redirects to shows the file instead of saving it.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/documents/[id]/file">,
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
  const url = await documents.viewUrl(documentId);

  if (!url) {
    return new Response("Document not found.", { status: 404 });
  }

  redirect(url);
}
