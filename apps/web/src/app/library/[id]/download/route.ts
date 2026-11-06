import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  createLibraryController,
  createProfileController,
} from "@/lib/dependencies/server";
import { authRoutes } from "@/models/auth/auth-routes";
import { parseLibraryId } from "@/models/library/library.model";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/library/[id]/download">,
) {
  const profiles = await createProfileController();

  if (!(await profiles.currentViewer())) {
    redirect(authRoutes.signIn);
  }

  const { id } = await context.params;
  const materialId = parseLibraryId(id);

  if (materialId === null) {
    return new Response("Material not found.", { status: 404 });
  }

  const library = await createLibraryController();
  const url = await library.downloadUrl(materialId);

  if (!url) {
    return new Response("Material not found.", { status: 404 });
  }

  redirect(url);
}