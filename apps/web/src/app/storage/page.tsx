import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import {
  cancelStorageRequestAction,
  requestStorageAction,
} from "@/app/storage/actions";
import {
  createProfileController,
  createStorageRequestController,
} from "@/lib/dependencies/server";
import { adminBasePath } from "@/models/admin/admin.model";
import { authRoutes } from "@/models/auth/auth-routes";
import { StoragePageView } from "@/views/storage/storage-page.view";

export const metadata: Metadata = {
  title: "My storage",
};

export default async function StoragePage() {
  const viewer = await (await createProfileController()).currentViewer();

  if (!viewer) {
    redirect(authRoutes.signIn);
  }

  if (viewer.role === "admin") {
    redirect(adminBasePath);
  }

  const model = await (await createStorageRequestController()).loadPage();

  if (!model) {
    redirect(authRoutes.signIn);
  }

  return (
    <StoragePageView
      viewer={viewer}
      model={model}
      requestAction={requestStorageAction}
      cancelAction={cancelStorageRequestAction}
      signOutAction={signOutAction}
    />
  );
}
