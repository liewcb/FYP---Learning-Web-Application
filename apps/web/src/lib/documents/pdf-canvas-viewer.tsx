"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";

import type { PdfViewerProps } from "@/interfaces/services/document-viewer.interface";
import { revealWithin } from "@/lib/documents/reveal";
import { findInPieces, looseText, searchCandidates } from "@/lib/documents/text-match";

/** Wraps each match of `needle` (from looseText) in the text layer's spans in <mark>. */
function markMatches(spans: readonly HTMLElement[], needle: string) {
  const ranges = new Map<number, { from: number; to: number }[]>();

  for (const match of findInPieces(spans.map((span) => span.textContent ?? ""), needle)) {
    for (const { piece, from, to } of match) {
      const list = ranges.get(piece) ?? [];
      list.push({ from, to });
      ranges.set(piece, list);
    }
  }

  for (const [spanIndex, list] of ranges) {
    const span = spans[spanIndex];
    const text = span.textContent ?? "";
    const parts: Node[] = [];
    let start = 0;

    for (const { from, to } of list) {
      parts.push(document.createTextNode(text.slice(start, from)));
      const mark = document.createElement("mark");
      mark.className = "pdf-find-hit";
      mark.textContent = text.slice(from, to);
      parts.push(mark);
      start = to;
    }

    parts.push(document.createTextNode(text.slice(start)));
    span.replaceChildren(...parts);
  }
}

/** Renders one page of a PDF with pdf.js, scaled to the viewer's width. */
export function PdfCanvasViewer({ data, page, zoom, find, onFind, onLoaded, onError }: PdfViewerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pdfjsRef = useRef<typeof import("pdfjs-dist") | null>(null);
  // Each page's text, as looseText.
  const pageTextsRef = useRef(new Map<number, string>());
  /** The last search: what was asked, the words that were found, and where. */
  const lastFindRef = useRef<{ readonly query: string; readonly needle: string; readonly page: number } | null>(null);
  // The page on screen and the words marked on it.
  const shownRef = useRef<{ readonly page: number; readonly needle: string } | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);
  /** The words to mark, as looseText; empty for none. */
  const [marked, setMarked] = useState("");
  const callbacks = useRef({ onLoaded, onError, onFind });

  useEffect(() => {
    callbacks.current = { onLoaded, onError, onFind };
  }, [onLoaded, onError, onFind]);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;

    void (async () => {
      try {
        // Loaded only when a PDF is shown.
        const pdfjs = await import("pdfjs-dist");

        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        pdfjsRef.current = pdfjs;
        pageTextsRef.current = new Map();

        // pdf.js takes ownership of the buffer it is given, so pass a copy.
        task = pdfjs.getDocument({ data: data.slice(0) });
        const loaded = await task.promise;

        if (cancelled) {
          return;
        }

        setPdf(loaded);
        callbacks.current.onLoaded(loaded.numPages);
      } catch (error) {
        console.error("Opening PDF failed.", error);

        if (!cancelled) {
          callbacks.current.onError();
        }
      }
    })();

    return () => {
      cancelled = true;
      // Frees the document and its worker.
      void task?.destroy();
    };
  }, [data]);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      // Whole pixels, so tiny layout shifts do not re-render the page.
      setWidth(Math.floor(entry.contentRect.width));
    });

    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // A search: the first page with the words, or the next one when asked again.
  useEffect(() => {
    const query = find?.query.trim().toLowerCase() ?? "";

    if (!pdf || !find || !query) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const textOf = async (number: number) => {
        const cached = pageTextsRef.current.get(number);

        if (cached !== undefined) {
          return cached;
        }

        const content = await (await pdf.getPage(number)).getTextContent();
        const text = looseText(content.items.map((item) => ("str" in item ? item.str : "")).join(""));

        pageTextsRef.current.set(number, text);
        return text;
      };

      const last = lastFindRef.current;
      const again = last !== null && last.query === query;
      const candidates = again ? [last.needle] : searchCandidates(query);
      const first = again ? (last.page % pdf.numPages) + 1 : 1;

      try {
        for (const needle of candidates) {
          for (let step = 0; step < pdf.numPages; step += 1) {
            const number = ((first - 1 + step) % pdf.numPages) + 1;
            const found = (await textOf(number)).includes(needle);

            if (cancelled) {
              return;
            }

            if (!found) {
              continue;
            }

            lastFindRef.current = { query, needle, page: number };
            setMarked(needle);
            callbacks.current.onFind?.(number);

            // Already on screen (only this page has the words): bring the match back into view.
            const shown = shownRef.current;
            const hit = textLayerRef.current?.querySelector(".pdf-find-hit");

            if (shown?.page === number && shown.needle === needle && hit && frameRef.current) {
              revealWithin(frameRef.current, hit);
            }

            return;
          }
        }

        lastFindRef.current = null;
        setMarked("");
        callbacks.current.onFind?.(null);
      } catch (error) {
        console.error("Searching the PDF failed.", error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // A new request object searches again, even for the same words.
  }, [pdf, find]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textLayerDiv = textLayerRef.current;
    const pdfjs = pdfjsRef.current;

    if (!pdf || !canvas || !textLayerDiv || !pdfjs || width === 0) {
      return;
    }

    let task: RenderTask | null = null;
    let textLayer: TextLayer | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const pdfPage = await pdf.getPage(Math.min(Math.max(1, page), pdf.numPages));

        if (cancelled) {
          return;
        }

        const pixelRatio = window.devicePixelRatio || 1;
        const fitScale = width / pdfPage.getViewport({ scale: 1 }).width;
        const cssViewport = pdfPage.getViewport({ scale: fitScale * zoom });
        const viewport = pdfPage.getViewport({ scale: fitScale * zoom * pixelRatio });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;

        task = pdfPage.render({ canvas, viewport });
        await task.promise;

        // The page's text over the drawing: it can be selected, and search matches are marked.
        const content = await pdfPage.getTextContent();

        if (cancelled) {
          return;
        }

        textLayerDiv.replaceChildren();
        textLayerDiv.style.setProperty("--total-scale-factor", String(cssViewport.scale));
        textLayerDiv.style.width = `${Math.floor(cssViewport.width)}px`;
        textLayerDiv.style.height = `${Math.floor(cssViewport.height)}px`;
        textLayer = new pdfjs.TextLayer({
          textContentSource: content,
          container: textLayerDiv,
          viewport: cssViewport,
        });
        await textLayer.render();

        if (cancelled) {
          return;
        }

        shownRef.current = { page: pdfPage.pageNumber, needle: marked };

        if (marked) {
          markMatches(textLayer.textDivs, marked);
          const hit = textLayerDiv.querySelector(".pdf-find-hit");

          if (hit && frameRef.current) {
            revealWithin(frameRef.current, hit);
          }
        }
      } catch (error) {
        // A newer page or size cancels the render in progress; that is fine.
        if (!cancelled && (error as { name?: string }).name !== "RenderingCancelledException") {
          console.error("Rendering PDF page failed.", error);
        }
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, page, width, zoom, marked]);

  return (
    <div className="shared-pdf" ref={frameRef}>
      <div className="pdf-page">
        <canvas ref={canvasRef} aria-label={`Page ${page}`} role="img" />
        <div className="textLayer" ref={textLayerRef} />
      </div>
    </div>
  );
}
