"use client";

import { useEffect, useRef, useState } from "react";

import type { DocxViewerProps } from "@/interfaces/services/document-viewer.interface";
import { revealWithin } from "@/lib/documents/reveal";
import { findInPieces, searchCandidates } from "@/lib/documents/text-match";

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

const findClass = "docx-find-hit";

/** Puts back the text that earlier search marks wrapped. */
function clearMarks(container: HTMLElement) {
  for (const mark of container.querySelectorAll(`mark.${findClass}`)) {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
  }

  container.normalize();
}

function textNodes(container: HTMLElement): Text[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
  }

  return nodes;
}

/** How many times `needle` (from looseText) appears in the document. */
function countMatches(container: HTMLElement, needle: string): number {
  return findInPieces(textNodes(container).map((node) => node.data), needle).length;
}

/**
 * Marks the match of `needle` after the `skip`-th one (wrapping round) and
 * returns its first mark, or null when there is none. A match may run over
 * several text nodes (a word in bold, a line break), each part marked.
 */
function markMatch(container: HTMLElement, needle: string, skip: number): HTMLElement | null {
  const nodes = textNodes(container);
  const matches = findInPieces(nodes.map((node) => node.data), needle);

  if (matches.length === 0) {
    return null;
  }

  let first: HTMLElement | null = null;

  // Each part is in a different text node, so marking one leaves the others' offsets as they were.
  for (const { piece, from, to } of matches[skip % matches.length]) {
    const range = document.createRange();
    range.setStart(nodes[piece], from);
    range.setEnd(nodes[piece], to);
    const mark = document.createElement("mark");
    mark.className = findClass;
    range.surroundContents(mark);
    first ??= mark;
  }

  return first;
}

/** Renders a Word document as HTML with docx-preview, scrolled like the presenter. */
export function DocxHtmlViewer({ data, scrollTo, onScroll, find, onFind, onLoaded, onError }: DocxViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Scroll events caused by following the presenter are not the reader's own.
  const applyingRef = useRef(false);
  const callbacks = useRef({ onScroll, onLoaded, onError, onFind });
  const [rendered, setRendered] = useState(false);
  /** The last search: what was asked, the words found, and how many matches have been shown. */
  const lastFindRef = useRef<{ readonly query: string; readonly needle: string; readonly count: number } | null>(null);

  useEffect(() => {
    callbacks.current = { onScroll, onLoaded, onError, onFind };
  }, [onScroll, onLoaded, onError, onFind]);

  // A search marks the next match; asking for the same words again moves on.
  useEffect(() => {
    const body = bodyRef.current;
    const query = find?.query.trim().toLowerCase() ?? "";

    if (!body || !rendered || !find || !query) {
      return;
    }

    clearMarks(body);
    const last = lastFindRef.current;
    const again = last !== null && last.query === query;
    // All the words, or for a long sentence its first words, whichever is found.
    const needle = again
      ? last.needle
      : searchCandidates(query).find((candidate) => countMatches(body, candidate) > 0);
    const skip = again ? last.count : 0;
    const mark = needle ? markMatch(body, needle, skip) : null;

    if (mark && scrollRef.current) {
      revealWithin(scrollRef.current, mark);
    }

    lastFindRef.current = mark && needle ? { query, needle, count: skip + 1 } : null;
    callbacks.current.onFind?.(mark !== null);
  }, [find, rendered]);

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
        setRendered(true);
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
