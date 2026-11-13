"use client";

import type { ReactNode } from "react";

import { documentViewers } from "@/lib/documents/document-viewers";
import { DocumentViewersProvider } from "@/views/documents/document-viewers-context.view";

/** Client entry point: supplies the original-file viewers to the views inside. */
export function ConnectedDocumentViewers({ children }: { readonly children: ReactNode }) {
  return <DocumentViewersProvider viewers={documentViewers}>{children}</DocumentViewersProvider>;
}
