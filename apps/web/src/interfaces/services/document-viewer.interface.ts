import type { ComponentType } from "react";

export interface PdfViewerProps {
  readonly data: ArrayBuffer;
  /** From 1. */
  readonly page: number;
  /** 1 fits the page to the viewer's width. */
  readonly zoom: number;
  /**
   * Finds words in the PDF; a new object searches again, from the page after
   * the last match when the words are the same. Matches on the page shown
   * are marked.
   */
  readonly find?: { readonly query: string } | null;
  /** The page that has the words, or null when no page does. */
  readonly onFind?: (page: number | null) => void;
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
  /** Finds words, like PdfViewerProps.find: the next match is marked and scrolled to. */
  readonly find?: { readonly query: string } | null;
  readonly onFind?: (found: boolean) => void;
  readonly onLoaded: () => void;
  readonly onError: () => void;
}

/** Renders presented documents in the browser, supplied by the route. */
export interface DocumentViewers {
  readonly Pdf: ComponentType<PdfViewerProps>;
  readonly Docx: ComponentType<DocxViewerProps>;
}
