import type { ComponentType } from "react";

export interface PdfViewerProps {
  readonly data: ArrayBuffer;
  /** From 1. */
  readonly page: number;
  /** 1 fits the page to the viewer's width. */
  readonly zoom: number;
  readonly onLoaded: (pageCount: number) => void;
  readonly onError: () => void;
}

export interface DocxViewerProps {
  readonly data: ArrayBuffer;
  /**
   * Scrolls to `fraction` (0 to 1) each time a new object is passed, even to
   * the same place; null leaves the scroll alone.
   */
  readonly scrollTo: { readonly fraction: number } | null;
  /** The reader scrolled the document themselves (0 to 1). */
  readonly onScroll: (fraction: number) => void;
  readonly onLoaded: () => void;
  readonly onError: () => void;
}

/** Renders presented documents in the browser, supplied by the route. */
export interface DocumentViewers {
  readonly Pdf: ComponentType<PdfViewerProps>;
  readonly Docx: ComponentType<DocxViewerProps>;
}
