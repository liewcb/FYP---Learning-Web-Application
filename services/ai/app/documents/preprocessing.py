"""Clean extracted text and split it into sentences for analysis and quizzes.

The output is deliberately conservative: headings, page furniture, captions and
number-only fragments are kept out of the sentence list so that content
analysis and quiz generation only see complete statements from the material.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from math import ceil
from typing import Any

import spacy

from .extraction import ExtractedDocument, ExtractionError, SourceBlock


MIN_SENTENCE_WORDS = 3
# Matches the per-sentence limit accepted by the analysis and quiz contracts.
MAX_SENTENCE_CHARACTERS = 2_000
MAX_TEXT_CHARACTERS = 1_000_000
MAX_SENTENCES = 10_000
HEADING_MAX_WORDS = 12
HEADING_MAX_CHARACTERS = 80
MIN_LETTER_RATIO = 0.5
# Header/footer detection: a line near the top or bottom of a page that repeats
# on at least half of the pages (and on three or more) is page furniture.
EDGE_LINES = 3
REPEATED_LINE_MIN_PAGES = 3
REPEATED_LINE_PAGE_RATIO = 0.5
ENGLISH_CHECK_MIN_WORDS = 200
ENGLISH_MIN_MARKER_RATIO = 0.05

_INVISIBLE = re.compile(r"[­​-‍⁠﻿]")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_WHITESPACE = re.compile(r"[^\S\n]+")
_BULLET = re.compile(
    r"^\s*(?:[-*•‣⁃∙▪●◦■□➢➤►·o]"
    r"|\(?\d{1,3}[.)]|\(?[a-zA-Z]\))\s+"
)
_PAGE_NUMBER = re.compile(
    r"^(?:page\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?"
    r"(?:\s*(?:of|/)\s*\d{1,4})?$",
    re.IGNORECASE,
)
_ENDS_BLOCK = re.compile(r"[.!?:;][\"'”’)\]]*$")
_HYPHENATED_BREAK = re.compile(r"[A-Za-z]-$")
_CAPTION = re.compile(r"^(?:figure|fig\.|table|source|diagram)\s*\d", re.IGNORECASE)
_URL_ONLY = re.compile(r"^(?:https?://|www\.)\S+$", re.IGNORECASE)
_DIGITS = re.compile(r"\d+")
_WORD = re.compile(r"[a-z']+")

# Common English function words. Headings rarely end with one, and normal
# English prose uses them heavily, which gives a cheap language signal.
_FUNCTION_WORDS = frozenset(
    {
        "a", "an", "and", "are", "as", "at", "be", "by", "can", "for", "from",
        "has", "have", "in", "into", "is", "it", "its", "not", "of", "on", "or",
        "that", "the", "their", "this", "to", "was", "were", "which", "with",
    }
)


@dataclass(frozen=True)
class PreprocessedDocument:
    text: str
    sentences: list[str]
    word_count: int
    language_code: str
    warnings: list[str]


def preprocess_document(extracted: ExtractedDocument) -> PreprocessedDocument:
    if extracted.pages:
        blocks = pdf_pages_to_blocks(extracted.pages)
    else:
        blocks = clean_blocks(extracted.blocks)

    warnings = list(extracted.warnings)
    blocks, truncated = _limit_text(blocks)
    if truncated:
        warnings.append(
            "The material is very long, so only the first "
            f"{MAX_TEXT_CHARACTERS:,} characters were kept."
        )

    text = "\n\n".join(block.text for block in blocks)
    if not text.strip():
        raise ExtractionError("This material does not contain any readable text.")

    sentences = split_sentences(blocks)
    if not sentences:
        raise ExtractionError(
            "No complete sentences were found. Upload material that contains "
            "written explanations rather than only headings, tables or images."
        )
    if len(sentences) > MAX_SENTENCES:
        sentences = sentences[:MAX_SENTENCES]
        warnings.append(f"Only the first {MAX_SENTENCES:,} sentences were kept.")

    if _probably_not_english(text):
        warnings.append(
            "This material may not be in English, so analysis and quiz quality "
            "may be lower."
        )

    return PreprocessedDocument(
        text=text,
        sentences=sentences,
        word_count=len(text.split()),
        language_code="en",
        warnings=warnings,
    )


def normalise_text(text: str) -> str:
    """Unify Unicode forms, ligatures, line endings and invisible characters."""

    text = unicodedata.normalize("NFKC", text)
    text = _INVISIBLE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " ")
    return _CONTROL.sub("", text)


def pdf_pages_to_blocks(pages: list[str]) -> list[SourceBlock]:
    """Rebuild paragraphs from PDF lines after removing page furniture."""

    page_lines = [
        [_collapse(line) for line in normalise_text(page).split("\n")]
        for page in pages
    ]
    repeated = _repeated_edge_lines(page_lines)
    lines: list[str] = []

    for page in page_lines:
        edge_indexes = _edge_indexes(page)
        for index, line in enumerate(page):
            if _PAGE_NUMBER.match(line):
                continue
            if index in edge_indexes and _line_key(line) in repeated:
                continue
            lines.append(line)

    return _lines_to_blocks(lines)


def clean_blocks(blocks: list[SourceBlock]) -> list[SourceBlock]:
    """Normalise blocks from formats that already describe their structure."""

    cleaned: list[SourceBlock] = []
    for block in blocks:
        if block.kind == "image_text":
            # OCR returns positioned lines, just like a PDF page.
            lines = [_collapse(line) for line in normalise_text(block.text).split("\n")]
            cleaned.extend(_lines_to_blocks(lines))
            continue

        text = _collapse(normalise_text(block.text).replace("\n", " "))
        if not text:
            continue
        kind = block.kind
        bullet = _BULLET.match(text)
        if bullet and kind == "paragraph":
            # Students often type bullets instead of using Word list styles.
            kind = "list_item"
        if bullet:
            text = text[bullet.end():].strip()
        if text:
            cleaned.append(SourceBlock(kind, text))
    return cleaned


def split_sentences(blocks: list[SourceBlock]) -> list[str]:
    """Return ordered, de-duplicated sentences that are useful for learning."""

    texts = [block.text for block in blocks if block.kind != "heading"]
    sentences: list[str] = []
    seen: set[str] = set()

    for document in _sentence_splitter().pipe(texts):
        for span in document.sents:
            for sentence in _split_long_sentence(_clean_sentence(span.text)):
                key = sentence.casefold()
                if key in seen or not _is_usable_sentence(sentence):
                    continue
                seen.add(key)
                sentences.append(sentence)

    return sentences


@lru_cache(maxsize=1)
def _sentence_splitter() -> Any:
    # A rule-based sentencizer is fast, deterministic and needs no model
    # download. The English tokenizer keeps abbreviations such as "e.g." whole.
    nlp = spacy.blank("en")
    nlp.add_pipe("sentencizer")
    nlp.max_length = MAX_TEXT_CHARACTERS + 1
    return nlp


def _lines_to_blocks(lines: list[str]) -> list[SourceBlock]:
    blocks: list[SourceBlock] = []
    kind = "paragraph"
    text = ""
    line_count = 0
    previous = ""

    def flush() -> None:
        nonlocal text, line_count, kind
        if text:
            block_kind = kind
            if block_kind == "paragraph" and line_count == 1 and _looks_like_heading(text):
                block_kind = "heading"
            blocks.append(SourceBlock(block_kind, text))
        kind, text, line_count = "paragraph", "", 0

    for line in lines:
        if not line:
            flush()
            previous = ""
            continue

        bullet = _BULLET.match(line)
        if bullet:
            flush()
            kind, text, line_count = "list_item", line[bullet.end():].strip(), 1
        elif text and _continues(previous, line):
            text = _join_lines(text, line)
            line_count += 1
        else:
            flush()
            text, line_count = line, 1
        previous = line

    flush()
    return blocks


def _continues(previous: str, line: str) -> bool:
    """Decide whether a PDF line wraps the previous line's paragraph."""

    if _ENDS_BLOCK.search(previous):
        return False
    if _looks_like_heading(previous) and line[:1].isupper():
        return False
    return True


def _join_lines(text: str, line: str) -> str:
    # "infor-" + "mation" was split by the PDF layout, not by the author.
    if _HYPHENATED_BREAK.search(text) and line[:1].islower():
        return text[:-1] + line
    return f"{text} {line}"


def _looks_like_heading(line: str) -> bool:
    words = line.split()
    if not words or len(words) > HEADING_MAX_WORDS or len(line) > HEADING_MAX_CHARACTERS:
        return False
    if _ENDS_BLOCK.search(line) or line.endswith((",", "-")):
        return False
    if not (line[0].isupper() or line[0].isdigit()):
        return False
    return words[-1].lower() not in _FUNCTION_WORDS


def _repeated_edge_lines(page_lines: list[list[str]]) -> set[str]:
    if len(page_lines) < REPEATED_LINE_MIN_PAGES:
        return set()

    counts: dict[str, int] = {}
    for page in page_lines:
        keys = {_line_key(page[index]) for index in _edge_indexes(page)}
        for key in keys:
            counts[key] = counts.get(key, 0) + 1

    threshold = max(
        REPEATED_LINE_MIN_PAGES,
        ceil(len(page_lines) * REPEATED_LINE_PAGE_RATIO),
    )
    return {key for key, count in counts.items() if count >= threshold}


def _edge_indexes(page: list[str]) -> set[int]:
    filled = [index for index, line in enumerate(page) if line]
    return set(filled[:EDGE_LINES] + filled[-EDGE_LINES:])


def _line_key(line: str) -> str:
    # Page numbers inside running headers change on every page.
    return _DIGITS.sub("#", line.casefold())


def _collapse(text: str) -> str:
    return _WHITESPACE.sub(" ", text).strip()


def _clean_sentence(sentence: str) -> str:
    sentence = _collapse(sentence.replace("\n", " "))
    bullet = _BULLET.match(sentence)
    return sentence[bullet.end():].strip() if bullet else sentence


def _split_long_sentence(sentence: str) -> list[str]:
    if len(sentence) <= MAX_SENTENCE_CHARACTERS:
        return [sentence]

    chunks: list[str] = []
    current = ""
    for word in sentence.split():
        word = word[:MAX_SENTENCE_CHARACTERS]
        candidate = f"{current} {word}" if current else word
        if len(candidate) > MAX_SENTENCE_CHARACTERS:
            chunks.append(current)
            current = word
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def _is_usable_sentence(sentence: str) -> bool:
    if len(sentence.split()) < MIN_SENTENCE_WORDS:
        return False
    if _CAPTION.match(sentence) or _URL_ONLY.match(sentence):
        return False

    visible = [character for character in sentence if not character.isspace()]
    letters = sum(1 for character in visible if character.isalpha())
    return bool(visible) and letters / len(visible) >= MIN_LETTER_RATIO


def _limit_text(blocks: list[SourceBlock]) -> tuple[list[SourceBlock], bool]:
    kept: list[SourceBlock] = []
    total = 0
    for block in blocks:
        remaining = MAX_TEXT_CHARACTERS - total
        if remaining <= 0:
            return kept, True
        if len(block.text) > remaining:
            kept.append(SourceBlock(block.kind, block.text[:remaining]))
            return kept, True
        kept.append(block)
        total += len(block.text) + 2
    return kept, False


def _probably_not_english(text: str) -> bool:
    words = _WORD.findall(text.casefold())
    if len(words) < ENGLISH_CHECK_MIN_WORDS:
        return False
    markers = sum(1 for word in words if word in _FUNCTION_WORDS)
    return markers / len(words) < ENGLISH_MIN_MARKER_RATIO
