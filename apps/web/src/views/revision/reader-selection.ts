import { comparePoints, type TextPoint, type TextRange } from "@/models/revision/highlight.model";

/**
 * Where a DOM position falls in the document's text. Sentences are rendered
 * with `data-sentence`; a position between them (a space, a passage's margin)
 * moves inward to the nearest sentence: forward for a start, back for an end.
 */
function pointAt(root: HTMLElement, node: Node, offset: number, edge: "start" | "end"): TextPoint | null {
  const element = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-sentence]");

  if (element && root.contains(element)) {
    const before = document.createRange();
    before.selectNodeContents(element);
    before.setEnd(node, offset);

    return { sentence: Number(element.dataset.sentence), offset: before.toString().length };
  }

  const sentences = [...root.querySelectorAll<HTMLElement>("[data-sentence]")];
  const position = document.createRange();
  position.setStart(node, offset);
  position.collapse(true);

  if (edge === "start") {
    const next = sentences.find((sentence) => position.comparePoint(sentence, 0) >= 0);

    return next ? { sentence: Number(next.dataset.sentence), offset: 0 } : null;
  }

  const previous = sentences.findLast((sentence) => position.comparePoint(sentence, sentence.childNodes.length) <= 0);

  return previous ? { sentence: Number(previous.dataset.sentence), offset: (previous.textContent ?? "").length } : null;
}

/** The document text the reader has selected inside `root`, or null when there is none. */
export function selectedRange(root: HTMLElement, selection: Selection | null): TextRange | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  const start = pointAt(root, range.startContainer, range.startOffset, "start");
  const end = pointAt(root, range.endContainer, range.endOffset, "end");

  return start && end && comparePoints(start, end) < 0 ? { start, end } : null;
}
