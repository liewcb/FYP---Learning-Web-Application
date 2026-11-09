"use client";

import { useEffect, useRef } from "react";

import type { DocxViewerProps } from "@/interfaces/services/document-viewer.interface";

const safeLink = /^(https?:|mailto:|#)/i;

/**
 * Presented files come from other students, so links that could run script
 * (javascript: and the like) are removed and the rest open in a new tab.
 */
function sanitiseLinks(container: HTMLElement) {
  for (const link of container.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href") ?? "";

    if (!safeLink.test(href.trim())) {
      link.removeAttribute("href");
    } else if (!href.startsWith("#")) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }
  }
}

/** Renders a Word document as HTML with docx-preview, scrolled like the presenter. */
export function DocxHtmlViewer({ data, scrollTo, onScroll, onLoaded, onError }: DocxViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Scroll events caused by following the presenter are not the reader's own.
  const applyingRef = useRef(false);
  const callbacks = useRef({ onScroll, onLoaded, onError });

  useEffect(() => {
    callbacks.current = { onScroll, onLoaded, onError };
  }, [onScroll, onLoaded, onError]);

  useEffect(() => {
    const body = bodyRef.current;
    let cancelled = false;

    if (!body) {
      return;
    }

    void (async () => {
      try {
        // Loaded only when someone presents a Word document.
        const { renderAsync } = await import("docx-preview");

        body.replaceChildren();
        await renderAsync(data.slice(0), body, undefined, {
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderAltChunks: false,
          renderComments: false,
          renderChanges: false,
        });

        if (cancelled) {
          return;
        }

        sanitiseLinks(body);
        callbacks.current.onLoaded();
      } catch (error) {
        console.error("Opening Word document failed.", error);

        if (!cancelled) {
          callbacks.current.onError();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    const element = scrollRef.current;

    if (!element || scrollTo === null) {
      return;
    }

    const target = Math.round(scrollTo.fraction * Math.max(0, element.scrollHeight - element.clientHeight));

    // No scroll event fires when the position does not change.
    if (Math.abs(element.scrollTop - target) >= 1) {
      applyingRef.current = true;
      element.scrollTop = target;
    }
  }, [scrollTo]);

  function scrolled() {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    if (applyingRef.current) {
      applyingRef.current = false;
      return;
    }

    const range = element.scrollHeight - element.clientHeight;

    callbacks.current.onScroll(range > 0 ? element.scrollTop / range : 0);
  }

  return (
    <div className="shared-docx" ref={scrollRef} onScroll={scrolled}>
      <div ref={bodyRef} />
    </div>
  );
}
