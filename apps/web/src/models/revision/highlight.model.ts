import type { ReaderBlock } from "@/models/revision/revision.model";

export const highlightColours = ["yellow", "green", "blue", "pink", "purple"] as const;

export type HighlightColour = (typeof highlightColours)[number];

export const highlightColourNames: Readonly<Record<HighlightColour, string>> = {
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  pink: "Pink",
  purple: "Purple",
};

export function isHighlightColour(value: unknown): value is HighlightColour {
  return typeof value === "string" && (highlightColours as readonly string[]).includes(value);
}

export const highlightRules = {
  /** Also enforced by the database. */
  maxPerDocument: 1000,
  /** Highlights removed in one request (a passage's worth). */
  maxRemovedAtOnce: 200,
  /** Largest sentence index or character offset accepted. */
  maxIndex: 1_000_000,
} as const;

/** A place in a document's text: a sentence, and a character in it as the reader shows it. */
export interface TextPoint {
  readonly sentence: number;
  readonly offset: number;
}

/** Text from `start` up to, but not including, `end`; it may cross sentences and passages. */
export interface TextRange {
  readonly start: TextPoint;
  readonly end: TextPoint;
}

export interface StudyHighlight extends TextRange {
  readonly id: number;
  readonly colour: HighlightColour;
}

export interface CreateStudyHighlightInput {
  readonly ownerId: string;
  readonly documentId: number;
  readonly range: TextRange;
  readonly colour: HighlightColour;
}

export function comparePoints(a: TextPoint, b: TextPoint): number {
  return a.sentence - b.sentence || a.offset - b.offset;
}

function parsePoint(value: unknown): TextPoint | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { sentence, offset } = value as Record<string, unknown>;
  const valid = (number: unknown): number is number =>
    typeof number === "number" && Number.isSafeInteger(number) && number >= 0 && number <= highlightRules.maxIndex;

  return valid(sentence) && valid(offset) ? { sentence, offset } : null;
}

/** A range sent by the browser, or null when it is not a non-empty range. */
export function parseTextRange(value: unknown): TextRange | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { start, end } = value as Record<string, unknown>;
  const from = parsePoint(start);
  const to = parsePoint(end);

  return from && to && comparePoints(from, to) < 0 ? { start: from, end: to } : null;
}

/** The highlights touching each sentence, in the order given (later ones are drawn on top). */
export function highlightsBySentence(highlights: readonly StudyHighlight[]): Map<number, StudyHighlight[]> {
  const bySentence = new Map<number, StudyHighlight[]>();

  for (const highlight of highlights) {
    for (let sentence = highlight.start.sentence; sentence <= highlight.end.sentence; sentence += 1) {
      const list = bySentence.get(sentence);

      if (list) {
        list.push(highlight);
      } else {
        bySentence.set(sentence, [highlight]);
      }
    }
  }

  return bySentence;
}

export interface HighlightSegment {
  readonly from: number;
  readonly to: number;
  readonly highlight: StudyHighlight | null;
}

/**
 * Splits a sentence of `length` characters into plain and highlighted pieces.
 * Where highlights overlap, the one later in the list wins.
 */
export function sentenceSegments(
  sentence: number,
  length: number,
  highlights: readonly StudyHighlight[],
): HighlightSegment[] {
  const clamp = (value: number) => Math.min(Math.max(value, 0), length);
  const spans: HighlightSegment[] = [];

  for (const highlight of highlights) {
    const from =
      highlight.start.sentence === sentence ? highlight.start.offset : highlight.start.sentence < sentence ? 0 : length;
    const to = highlight.end.sentence === sentence ? highlight.end.offset : highlight.end.sentence > sentence ? length : 0;

    if (clamp(from) < clamp(to)) {
      spans.push({ from: clamp(from), to: clamp(to), highlight });
    }
  }

  if (spans.length === 0) {
    return length > 0 ? [{ from: 0, to: length, highlight: null }] : [];
  }

  const cuts = [...new Set([0, length, ...spans.flatMap((span) => [span.from, span.to])])].sort((a, b) => a - b);
  const segments: HighlightSegment[] = [];

  for (let index = 0; index + 1 < cuts.length; index += 1) {
    const from = cuts[index];
    const to = cuts[index + 1];
    let top: StudyHighlight | null = null;

    for (const span of spans) {
      if (span.from <= from && span.to >= to) {
        top = span.highlight;
      }
    }

    const last = segments.at(-1);

    if (last && last.highlight === top) {
      segments[segments.length - 1] = { ...last, to };
    } else {
      segments.push({ from, to, highlight: top });
    }
  }

  return segments;
}

/**
 * The highlight drawn over the space between a sentence (of `length`
 * characters) and the next one: the newest that covers both sides, if any.
 */
export function joinHighlight(
  sentence: number,
  length: number,
  next: number,
  highlights: readonly StudyHighlight[],
): StudyHighlight | null {
  let top: StudyHighlight | null = null;

  for (const highlight of highlights) {
    if (
      comparePoints(highlight.start, { sentence, offset: length }) < 0 &&
      comparePoints(highlight.end, { sentence: next, offset: 0 }) > 0
    ) {
      top = highlight;
    }
  }

  return top;
}

/** Each sentence's text as the reader shows it (headings are trimmed). */
export function readerSentenceTexts(blocks: readonly ReaderBlock[]): Map<number, string> {
  const texts = new Map<number, string>();

  for (const block of blocks) {
    if (block.kind === "heading") {
      texts.set(block.index, block.text);
    } else {
      for (const sentence of block.sentences) {
        texts.set(sentence.index, sentence.text);
      }
    }
  }

  return texts;
}

/** The words inside a range, on one line. */
export function rangeText(texts: ReadonlyMap<number, string>, range: TextRange): string {
  const parts: string[] = [];

  for (let sentence = range.start.sentence; sentence <= range.end.sentence; sentence += 1) {
    const text = texts.get(sentence);

    if (text !== undefined) {
      const from = sentence === range.start.sentence ? range.start.offset : 0;
      const to = sentence === range.end.sentence ? range.end.offset : text.length;

      parts.push(text.slice(from, to));
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The range without spaces at either end (a double-click also selects the
 * space after a word), or null when it holds no words at all.
 */
export function trimRange(texts: ReadonlyMap<number, string>, range: TextRange): TextRange | null {
  const textOf = (sentence: number) => texts.get(sentence) ?? "";
  let start = range.start;
  let end = range.end;

  while (comparePoints(start, end) < 0) {
    const text = textOf(start.sentence);

    if (start.offset >= text.length) {
      start = { sentence: start.sentence + 1, offset: 0 };
    } else if (/\s/.test(text[start.offset])) {
      start = { sentence: start.sentence, offset: start.offset + 1 };
    } else {
      break;
    }
  }

  while (comparePoints(start, end) < 0) {
    if (end.offset <= 0) {
      end = { sentence: end.sentence - 1, offset: textOf(end.sentence - 1).length };
    } else if (/\s/.test(textOf(end.sentence)[end.offset - 1])) {
      end = { sentence: end.sentence, offset: end.offset - 1 };
    } else {
      break;
    }
  }

  return comparePoints(start, end) < 0 ? { start, end } : null;
}

/** The first sentence of the passage that holds `sentence`, or null for a heading. */
export function passageStartFor(blocks: readonly ReaderBlock[], sentence: number): number | null {
  for (const block of blocks) {
    if (
      block.kind === "passage" &&
      block.start <= sentence &&
      sentence <= block.sentences[block.sentences.length - 1].index
    ) {
      return block.start;
    }
  }

  return null;
}
