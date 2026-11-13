/**
 * Loose text search for the original-file viewers. A file's own text rarely
 * matches the extracted text exactly (line breaks, hyphenation, spacing,
 * curly quotes), so only letters and digits are compared, lower-cased.
 */

const wordChar = /[\p{L}\p{N}]/u;

/** The letters and digits of `text`, lower-cased. */
export function looseText(text: string): string {
  let loose = "";

  for (const char of text.normalize("NFKC").toLowerCase()) {
    if (wordChar.test(char)) {
      loose += char;
    }
  }

  return loose;
}

/**
 * What to look for, best first: all the words, then (for a long sentence,
 * which may run over a page break or differ further on) its first words.
 */
export function searchCandidates(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const candidates = [looseText(query)];

  if (words.length > 8) {
    candidates.push(looseText(words.slice(0, 8).join(" ")));
  }

  if (words.length > 5) {
    candidates.push(looseText(words.slice(0, 5).join(" ")));
  }

  return [...new Set(candidates.filter((candidate) => candidate.length > 0))];
}

/** Part of one piece of text (a PDF text run, a DOM text node), by UTF-16 offsets. */
export interface PieceRange {
  readonly piece: number;
  readonly from: number;
  readonly to: number;
}

/**
 * Every match of `needle` (from looseText) in the pieces read as one text.
 * Each match is the part of each piece it covers, spaces and punctuation
 * between its letters included.
 */
export function findInPieces(pieces: readonly string[], needle: string): PieceRange[][] {
  if (!needle) {
    return [];
  }

  let joined = "";
  // For each UTF-16 unit of `joined`: the piece and character it came from.
  const owners: { piece: number; from: number; to: number }[] = [];

  pieces.forEach((text, piece) => {
    let offset = 0;

    for (const char of text) {
      const loose = looseText(char);

      joined += loose;

      for (let unit = 0; unit < loose.length; unit += 1) {
        owners.push({ piece, from: offset, to: offset + char.length });
      }

      offset += char.length;
    }
  });

  const matches: PieceRange[][] = [];

  for (let at = joined.indexOf(needle); at !== -1; at = joined.indexOf(needle, at + needle.length)) {
    const ranges: { piece: number; from: number; to: number }[] = [];

    for (let index = at; index < at + needle.length; index += 1) {
      const owner = owners[index];
      const last = ranges.at(-1);

      if (last && last.piece === owner.piece) {
        last.to = Math.max(last.to, owner.to);
      } else {
        // Running on into the next piece: take in the spaces and punctuation between.
        if (last && !wordChar.test(pieces[last.piece].slice(last.to))) {
          last.to = pieces[last.piece].length;
        }

        const before = pieces[owner.piece].slice(0, owner.from);
        ranges.push({ ...owner, from: last && !wordChar.test(before) ? 0 : owner.from });
      }
    }

    matches.push(ranges);
  }

  return matches;
}
