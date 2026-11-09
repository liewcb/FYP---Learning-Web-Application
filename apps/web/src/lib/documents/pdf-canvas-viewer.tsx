"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import type { PdfViewerProps } from "@/interfaces/services/document-viewer.interface";

/** Renders one page of a PDF with pdf.js, scaled to the viewer's width. */
export function PdfCanvasViewer({ data, page, zoom, onLoaded, onError }: PdfViewerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);
  const callbacks = useRef({ onLoaded, onError });

  useEffect(() => {
    callbacks.current = { onLoaded, onError };
  }, [onLoaded, onError]);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;

    void (async () => {
      try {
        // Loaded only when someone presents a PDF.
        const pdfjs = await import("pdfjs-dist");

        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

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

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!pdf || !canvas || width === 0) {
      return;
    }

    let task: RenderTask | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const pdfPage = await pdf.getPage(Math.min(Math.max(1, page), pdf.numPages));

        if (cancelled) {
          return;
        }

        const pixelRatio = window.devicePixelRatio || 1;
        const fitScale = width / pdfPage.getViewport({ scale: 1 }).width;
        const viewport = pdfPage.getViewport({ scale: fitScale * zoom * pixelRatio });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;

        task = pdfPage.render({ canvas, viewport });
        await task.promise;
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
    };
  }, [pdf, page, width, zoom]);

  return (
    <div className="shared-pdf" ref={frameRef}>
      <canvas ref={canvasRef} aria-label={`Page ${page}`} role="img" />
    </div>
  );
}
