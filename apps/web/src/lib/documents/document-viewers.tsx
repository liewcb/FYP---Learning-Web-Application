"use client";

import dynamic from "next/dynamic";

import type { DocumentViewers } from "@/interfaces/services/document-viewer.interface";

/**
 * pdf.js and docx-preview, each loaded only when a file of that kind is
 * shown. Used by the call screen and by the original-file viewer.
 */
export const documentViewers: DocumentViewers = {
  Pdf: dynamic(
    () => import("@/lib/documents/pdf-canvas-viewer").then((module) => module.PdfCanvasViewer),
    { ssr: false },
  ),
  Docx: dynamic(
    () => import("@/lib/documents/docx-html-viewer").then((module) => module.DocxHtmlViewer),
    { ssr: false },
  ),
};
