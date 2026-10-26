"""Read raw text out of uploaded PDF and DOCX learning materials."""

from __future__ import annotations

from dataclasses import dataclass, field
from importlib.metadata import PackageNotFoundError, version
from io import BytesIO
from typing import Literal

import docx
import pypdf
from docx.table import Table
from docx.text.paragraph import Paragraph


PDF_MIME_TYPE = "application/pdf"
DOCX_MIME_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_PDF_PAGES = 500

BlockKind = Literal["heading", "paragraph", "list_item", "table_row"]


class ExtractionError(ValueError):
    """The file cannot be read. The message is safe to show to the student."""


@dataclass(frozen=True)
class SourceBlock:
    """Structural text unit that the original file format told us about."""

    kind: BlockKind
    text: str


@dataclass(frozen=True)
class ExtractedDocument:
    """Raw text before cleaning.

    PDFs only expose positioned lines, so they arrive as one string per page and
    the preprocessor rebuilds paragraphs. DOCX files already describe headings,
    paragraphs, lists and tables, so they arrive as typed blocks.
    """

    extractor_name: str
    extractor_version: str
    page_count: int | None = None
    pages: list[str] = field(default_factory=list)
    blocks: list[SourceBlock] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def extract_document(content: bytes, mime_type: str) -> ExtractedDocument:
    if not content:
        raise ExtractionError("The uploaded file is empty.")
    if len(content) > MAX_FILE_BYTES:
        raise ExtractionError("The file must be 25 MB or smaller.")

    try:
        if mime_type == PDF_MIME_TYPE:
            return _extract_pdf(content)
        if mime_type == DOCX_MIME_TYPE:
            return _extract_docx(content)
    except ExtractionError:
        raise
    except Exception as error:
        # Parsers raise many library-specific errors for damaged files.
        raise ExtractionError(
            "The file could not be read. It may be damaged or saved in an "
            "unsupported format."
        ) from error

    raise ExtractionError("Only PDF and DOCX files are supported.")


def _extract_pdf(content: bytes) -> ExtractedDocument:
    reader = pypdf.PdfReader(BytesIO(content))

    if reader.is_encrypted:
        # Many "protected" PDFs only restrict editing and open without a password.
        try:
            decrypted = reader.decrypt("")
        except Exception as error:
            raise ExtractionError(
                "This PDF is password-protected. Upload an unlocked copy."
            ) from error
        if not decrypted:
            raise ExtractionError(
                "This PDF is password-protected. Upload an unlocked copy."
            )

    page_count = len(reader.pages)
    if page_count == 0:
        raise ExtractionError("This PDF does not contain any pages.")

    warnings: list[str] = []
    pages_to_read = min(page_count, MAX_PDF_PAGES)
    if page_count > MAX_PDF_PAGES:
        warnings.append(
            f"Only the first {MAX_PDF_PAGES} of {page_count} pages were processed."
        )

    pages = [reader.pages[index].extract_text() or "" for index in range(pages_to_read)]
    empty_pages = sum(1 for page in pages if not page.strip())

    if empty_pages == len(pages):
        raise ExtractionError(
            "No selectable text was found. Scanned or image-only PDFs are not "
            "supported yet."
        )
    if empty_pages:
        noun = "page has" if empty_pages == 1 else "pages have"
        warnings.append(
            f"{empty_pages} {noun} no selectable text and may contain only images."
        )

    return ExtractedDocument(
        extractor_name="pypdf",
        extractor_version=pypdf.__version__,
        page_count=page_count,
        pages=pages,
        warnings=warnings,
    )


def _extract_docx(content: bytes) -> ExtractedDocument:
    document = docx.Document(BytesIO(content))
    blocks: list[SourceBlock] = []

    for item in document.iter_inner_content():
        if isinstance(item, Paragraph):
            block = _paragraph_block(item)
            if block:
                blocks.append(block)
        elif isinstance(item, Table):
            blocks.extend(_table_blocks(item))

    if not blocks:
        raise ExtractionError("This document does not contain any text.")

    return ExtractedDocument(
        extractor_name="python-docx",
        extractor_version=_package_version("python-docx"),
        blocks=blocks,
    )


def _paragraph_block(paragraph: Paragraph) -> SourceBlock | None:
    # Soft line breaks inside a Word paragraph do not end the paragraph.
    text = paragraph.text.replace("\n", " ").strip()
    if not text:
        return None

    style_name = (paragraph.style.name if paragraph.style is not None else "") or ""
    if style_name.startswith(("Heading", "Title", "Subtitle")):
        return SourceBlock("heading", text)

    properties = paragraph._p.pPr
    numbered = properties is not None and properties.numPr is not None
    if numbered or style_name.startswith("List"):
        return SourceBlock("list_item", text)

    return SourceBlock("paragraph", text)


def _table_blocks(table: Table) -> list[SourceBlock]:
    blocks: list[SourceBlock] = []

    for row in table.rows:
        cells: list[str] = []
        for cell in row.cells:
            text = " ".join(cell.text.split())
            # Merged cells are repeated by python-docx; keep one copy.
            if text and (not cells or cells[-1] != text):
                cells.append(text)
        if cells:
            blocks.append(SourceBlock("table_row", "; ".join(cells)))

    return blocks


def _package_version(distribution: str) -> str:
    try:
        return version(distribution)
    except PackageNotFoundError:
        return "unknown"
