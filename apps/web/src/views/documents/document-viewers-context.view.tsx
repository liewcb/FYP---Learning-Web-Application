"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { DocumentViewers } from "@/interfaces/services/document-viewer.interface";

const DocumentViewersContext = createContext<DocumentViewers | null>(null);

/** Lets a route supply the PDF and Word viewers once for every page below it. */
export function DocumentViewersProvider({
  viewers,
  children,
}: {
  readonly viewers: DocumentViewers;
  readonly children: ReactNode;
}) {
  return <DocumentViewersContext.Provider value={viewers}>{children}</DocumentViewersContext.Provider>;
}

export function useDocumentViewers(): DocumentViewers | null {
  return useContext(DocumentViewersContext);
}
