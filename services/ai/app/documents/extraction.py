"""Read raw text out of uploaded PDF and DOCX learning materials."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from io import BytesIO
from typing import Any, Literal

import docx
import pypdf
import pypdfium2
from docx.document import Document as DocxDocument
from docx.table import Table
from docx.text.paragraph import Paragraph
from PIL import Image

from .ocr import OcrSession, package_version


logger = logging.getLogger(__name__)

PDF_MIME_TYPE = "application/pdf"
DOCX_MIME_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_PDF_PAGES = 500
# Pages with less selectable text than this are treated as scanned images.
MIN_PAGE_TEXT_CHARACTERS = 20
# 200 DPI is a common OCR resolution; PDF user space is 72 units per inch.
OCR_RENDER_SCALE = 200 / 72
# An embedded image this large with the page's shape is a full-page scan whose
# text layer was already extracted, so OCR would only duplicate it.
FULL_PAGE_SCAN_MIN_WIDTH = 1_000
FULL_PAGE_SCAN_ASPECT_TOLERANCE = 0.1

BlockKind = Literal["heading", "paragraph", "list_item", "table_row", "image_text"]


class ExtractionError(ValueError):
    """The file cannot be read. The message is safe to show to the student."""


@dataclass(frozen=True)
class SourceBlock:
    """Structural text unit that the original file format told us about.

    ``image_text`` blocks hold OCR lines separated by newlines; the
    preprocessor rebuilds their paragraphs the same way it does for PDFs.
    """

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


def extract_document(
    content: bytes, mime_type: str, ocr: OcrSession | None = None
) -> ExtractedDocument:
    if not content:
        raise ExtractionError("The uploaded file is empty.")
    if len(content) > MAX_FILE_BYTES:
        raise ExtractionError("The file must be 25 MB or smaller.")

    session = ocr or OcrSession()
    try:
        if mime_type == PDF_MIME_TYPE:
            return _extract_pdf(content, session)
        if mime_type == DOCX_MIME_TYPE:
            return _extract_docx(content, session)
    except ExtractionError:
        raise
    except Exception as error:
        # Parsers raise many library-specific errors for damaged files.
        raise ExtractionError(
            "The file could not be read. It may be damaged or saved in an "
            "unsupported format."
        ) from error

    raise ExtractionError("Only PDF and DOCX files are supported.")


def _extract_pdf(content: bytes, ocr: OcrSession) -> ExtractedDocument:
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

    renderer: Any = None
    pages: list[str] = []
    try:
        for index in range(pages_to_read):
            page = reader.pages[index]
            text = page.extract_text() or ""

            if _visible_length(text) >= MIN_PAGE_TEXT_CHARACTERS:
                image_texts = _ocr_pdf_page_images(page, ocr)
                pages.append("\n\n".join([text, *image_texts]))
                continue

            # Scanned or image-only page: render it and read it with OCR.
            if renderer is None:
                renderer = pypdfium2.PdfDocument(content)
            lines = ocr.read(_render_pdf_page(renderer, index))
            pages.append("\n".join(lines) if lines else text)
    finally:
        if renderer is not None:
            renderer.close()

    empty_pages = sum(1 for page in pages if not page.strip())
    if empty_pages == len(pages):
        raise ExtractionError(
            "No readable text was found, even after scanning the pages with OCR. "
            "Check that the file is not blank or a very low-quality scan."
        )
    if empty_pages:
        noun = "page has" if empty_pages == 1 else "pages have"
        warnings.append(f"{empty_pages} {noun} no readable text.")

    name, engine_version = _extractor_label("pypdf", pypdf.__version__, ocr)
    return ExtractedDocument(
        extractor_name=name,
        extractor_version=engine_version,
        page_count=page_count,
        pages=pages,
        warnings=warnings + ocr.warnings(),
    )


def _render_pdf_page(renderer: Any, index: int) -> Image.Image:
    page = renderer[index]
    try:
        return page.render(scale=OCR_RENDER_SCALE).to_pil()
    finally:
        page.close()


def _ocr_pdf_page_images(page: Any, ocr: OcrSession) -> list[str]:
    """Read text inside screenshots and diagrams on a page that has text."""

    texts: list[str] = []
    page_ratio = _aspect_ratio(float(page.mediabox.width), float(page.mediabox.height))

    try:
        images = list(page.images)
    except Exception:
        logger.warning("Could not list the images on a PDF page.", exc_info=True)
        return texts

    for embedded in images:
        try:
            image = embedded.image
        except Exception:
            # Some encodings (for example JBIG2) cannot be decoded by Pillow.
            continue
        if image is None or _looks_like_full_page_scan(image, page_ratio):
            continue
        lines = ocr.read(image)
        if lines:
            texts.append("\n".join(lines))

    return texts


def _looks_like_full_page_scan(image: Image.Image, page_ratio: float) -> bool:
    return (
        image.width >= FULL_PAGE_SCAN_MIN_WIDTH
        and abs(_aspect_ratio(image.width, image.height) - page_ratio)
        <= FULL_PAGE_SCAN_ASPECT_TOLERANCE
    )


def _extract_docx(content: bytes, ocr: OcrSession) -> ExtractedDocument:
    document = docx.Document(BytesIO(content))
    blocks: list[SourceBlock] = []

    for item in document.iter_inner_content():
        if isinstance(item, Paragraph):
            block = _paragraph_block(item)
            if block:
                blocks.append(block)
            # Pictures are anchored in paragraphs, so their text keeps its place.
            blocks.extend(_docx_image_blocks(document, item, ocr))
        elif isinstance(item, Table):
            blocks.extend(_table_blocks(item))

    if not blocks:
        raise ExtractionError("This document does not contain any text.")

    name, engine_version = _extractor_label(
        "python-docx", package_version("python-docx"), ocr
    )
    return ExtractedDocument(
        extractor_name=name,
        extractor_version=engine_version,
        blocks=blocks,
        warnings=ocr.warnings(),
    )


def _docx_image_blocks(
    document: DocxDocument, paragraph: Paragraph, ocr: OcrSession
) -> list[SourceBlock]:
    blocks: list[SourceBlock] = []

    for relationship_id in paragraph._p.xpath(".//a:blip/@r:embed"):
        part = document.part.related_parts.get(relationship_id)
        if part is None:
            continue
        try:
            image = Image.open(BytesIO(part.blob))
            image.load()
        except Exception:
            # Vector formats such as EMF/WMF cannot be read as pixels.
            continue
        lines = ocr.read(image)
        if lines:
            blocks.append(SourceBlock("image_text", "\n".join(lines)))

    return blocks


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


def _extractor_label(
    name: str, extractor_version: str, ocr: OcrSession
) -> tuple[str, str]:
    if not ocr.used:
        return name, extractor_version
    ocr_name, ocr_version = ocr.engine_label
    return f"{name}+{ocr_name}", f"{extractor_version}+{ocr_version}"


def _visible_length(text: str) -> int:
    return sum(1 for character in text if not character.isspace())


def _aspect_ratio(width: float, height: float) -> float:
    return width / height if height else 0.0
