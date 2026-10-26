import json
from datetime import datetime, timezone
from io import BytesIO

import docx
import httpx
import pypdf
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont

from app.documents.extraction import (
    DOCX_MIME_TYPE,
    PDF_MIME_TYPE,
    ExtractedDocument,
    ExtractionError,
    SourceBlock,
    extract_document,
)
from app.documents.ocr import MAX_OCR_IMAGES, OcrSession, RapidOcrEngine
from app.documents.preprocessing import (
    MAX_SENTENCE_CHARACTERS,
    normalise_text,
    pdf_pages_to_blocks,
    preprocess_document,
    split_sentences,
)
from app.documents.routes import get_document_processor
from app.documents.schemas import ClaimedDocument, DocumentContentRecord
from app.documents.service import (
    DocumentNotFoundError,
    DocumentNotProcessableError,
    DocumentProcessor,
)
from app.main import app
from app.persistence.supabase import SupabasePersistence


SAFETY_NOTES_PAGES = [
    [
        "CS101 Software Safety Notes",
        "Hazard Analysis",
        "Hazard analysis identifies the causes of system",
        "hazards and suggests suitable mitigation strate-",
        "gies for each one.",
        "• Fault trees show how component failures combine.",
        "Page 1 of 3",
    ],
    [
        "CS101 Software Safety Notes",
        "Software reliability measures how long a system",
        "operates without failure.",
        "Figure 2 Reliability growth curve",
        "Page 2 of 3",
    ],
    [
        "CS101 Software Safety Notes",
        "Safety requirements address hazards early in the",
        "Design phase of the project.",
        "Page 3 of 3",
    ],
]

EXPECTED_SAFETY_SENTENCES = [
    "Hazard analysis identifies the causes of system hazards and suggests "
    "suitable mitigation strategies for each one.",
    "Fault trees show how component failures combine.",
    "Software reliability measures how long a system operates without failure.",
    "Safety requirements address hazards early in the Design phase of the project.",
]


def build_pdf(pages: list[list[str]]) -> bytes:
    """Create a small text PDF so extraction runs against a real parser."""

    def escape(text: str) -> str:
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    objects: dict[int, bytes] = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        3: (
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
            b"/Encoding /WinAnsiEncoding >>"
        ),
    }
    kids: list[str] = []
    next_id = 4
    for lines in pages:
        page_id, content_id = next_id, next_id + 1
        next_id += 2
        stream = (
            "BT /F1 11 Tf 14 TL 72 760 Td "
            + " ".join(f"({escape(line)}) Tj T*" for line in lines)
            + " ET"
        ).encode("cp1252")
        objects[content_id] = (
            f"<< /Length {len(stream)} >>\nstream\n".encode()
            + stream
            + b"\nendstream"
        )
        objects[page_id] = (
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>"
        ).encode()
        kids.append(f"{page_id} 0 R")
    objects[2] = (
        f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(pages)} >>"
    ).encode()

    output = bytearray(b"%PDF-1.4\n")
    offsets: dict[int, int] = {}
    for object_id in sorted(objects):
        offsets[object_id] = len(output)
        output += f"{object_id} 0 obj\n".encode() + objects[object_id] + b"\nendobj\n"
    xref_offset = len(output)
    size = max(objects) + 1
    output += f"xref\n0 {size}\n0000000000 65535 f \n".encode()
    for object_id in range(1, size):
        output += f"{offsets[object_id]:010d} 00000 n \n".encode()
    output += (
        f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
    ).encode()
    return bytes(output)


def build_docx() -> bytes:
    document = docx.Document()
    document.add_heading("Database Normalisation", level=1)
    document.add_paragraph(
        "Database normalisation reduces duplicated data. It also improves consistency."
    )
    document.add_paragraph("First normal form requires atomic values", style="List Bullet")
    table = document.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Term"
    table.cell(0, 1).text = "Meaning"
    table.cell(1, 0).text = "2NF"
    table.cell(1, 1).text = "Removes partial dependencies on a composite key"
    document.add_paragraph("Keys, e.g. student IDs, identify each row uniquely.")
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


# Preprocessing ---------------------------------------------------------------


def test_pdf_lines_are_rebuilt_into_clean_sentences():
    pages = ["\n".join(lines) for lines in SAFETY_NOTES_PAGES]
    extracted = ExtractedDocument(
        extractor_name="test", extractor_version="1", page_count=3, pages=pages
    )

    result = preprocess_document(extracted)

    assert result.sentences == EXPECTED_SAFETY_SENTENCES
    # Headings stay in the readable text but never become quiz sentences.
    assert "Hazard Analysis" in result.text
    assert "CS101 Software Safety Notes" not in result.text
    assert "Page 2 of 3" not in result.text
    assert result.language_code == "en"
    assert result.warnings == []


def test_pdf_blocks_mark_headings_and_list_items():
    blocks = pdf_pages_to_blocks(["\n".join(lines) for lines in SAFETY_NOTES_PAGES])

    assert SourceBlock("heading", "Hazard Analysis") in blocks
    assert SourceBlock(
        "list_item", "Fault trees show how component failures combine."
    ) in blocks


def test_headers_are_kept_when_a_document_is_too_short_to_detect_them():
    blocks = pdf_pages_to_blocks(
        ["Course Notes\nThe kernel schedules every process fairly."]
    )

    assert blocks[0] == SourceBlock("heading", "Course Notes")


def test_normalise_text_fixes_ligatures_and_invisible_characters():
    assert normalise_text("eﬃcient­ data​\r\nflow\x00") == "efficient data\nflow"


def test_sentence_filter_drops_fragments_duplicates_and_number_rows():
    blocks = [
        SourceBlock("paragraph", "Short line."),
        SourceBlock("paragraph", "Indexes speed up lookups on large tables."),
        SourceBlock("paragraph", "Indexes speed up lookups on large tables."),
        SourceBlock("table_row", "12; 45.6; 78; 90.1"),
        SourceBlock("paragraph", "See https://example.com/notes"),
        SourceBlock("heading", "Indexing Strategies For Large Tables"),
    ]

    assert split_sentences(blocks) == ["Indexes speed up lookups on large tables."]


def test_overlong_sentences_are_split_to_the_analysis_limit():
    long_sentence = " ".join(["normalisation"] * 400) + "."

    sentences = split_sentences([SourceBlock("paragraph", long_sentence)])

    assert len(sentences) > 1
    assert all(len(sentence) <= MAX_SENTENCE_CHARACTERS for sentence in sentences)


def test_material_without_sentences_is_rejected_with_a_student_message():
    extracted = ExtractedDocument(
        extractor_name="test",
        extractor_version="1",
        blocks=[SourceBlock("heading", "Chapter One"), SourceBlock("table_row", "1; 2")],
    )

    with pytest.raises(ExtractionError, match="No complete sentences"):
        preprocess_document(extracted)


def test_non_english_material_receives_a_warning():
    sentence = "Pangkalan data menyimpan maklumat pelajar dengan selamat setiap hari. "
    extracted = ExtractedDocument(
        extractor_name="test",
        extractor_version="1",
        blocks=[SourceBlock("paragraph", sentence * 30)],
    )

    result = preprocess_document(extracted)

    assert any("may not be in English" in warning for warning in result.warnings)


# Extraction ------------------------------------------------------------------


def test_pdf_extraction_reads_every_page():
    extracted = extract_document(build_pdf(SAFETY_NOTES_PAGES), PDF_MIME_TYPE)

    assert extracted.extractor_name == "pypdf"
    assert extracted.page_count == 3
    assert len(extracted.pages) == 3
    assert preprocess_document(extracted).sentences == EXPECTED_SAFETY_SENTENCES


def test_blank_pdf_is_rejected_after_ocr_finds_nothing():
    engine = FakeOcrEngine([])

    with pytest.raises(ExtractionError, match="No readable text"):
        extract_document(blank_pdf(), PDF_MIME_TYPE, OcrSession(lambda: engine))

    assert engine.calls == 1


def test_password_protected_pdf_is_rejected():
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=612, height=792)
    writer.encrypt(user_password="secret", algorithm="RC4-128")
    buffer = BytesIO()
    writer.write(buffer)

    with pytest.raises(ExtractionError, match="password-protected"):
        extract_document(buffer.getvalue(), PDF_MIME_TYPE)


def test_damaged_files_raise_a_readable_error():
    with pytest.raises(ExtractionError, match="could not be read"):
        extract_document(b"not really a pdf", PDF_MIME_TYPE)
    with pytest.raises(ExtractionError, match="could not be read"):
        extract_document(b"not really a docx", DOCX_MIME_TYPE)


def test_docx_extraction_keeps_structure_and_abbreviations():
    extracted = extract_document(build_docx(), DOCX_MIME_TYPE)
    result = preprocess_document(extracted)

    assert extracted.extractor_name == "python-docx"
    assert extracted.page_count is None
    assert extracted.blocks[0] == SourceBlock("heading", "Database Normalisation")
    assert SourceBlock("list_item", "First normal form requires atomic values") in (
        extracted.blocks
    )
    assert result.sentences == [
        "Database normalisation reduces duplicated data.",
        "It also improves consistency.",
        "First normal form requires atomic values",
        "2NF; Removes partial dependencies on a composite key",
        "Keys, e.g. student IDs, identify each row uniquely.",
    ]


# OCR -------------------------------------------------------------------------


class FakeOcrEngine:
    name = "fake-ocr"
    version = "1"

    def __init__(self, lines: list[str]) -> None:
        self.lines = lines
        self.calls = 0

    def read_lines(self, image):
        self.calls += 1
        return list(self.lines)


def blank_pdf() -> bytes:
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def text_image(lines: list[str]) -> Image.Image:
    """Picture of typed text, like a screenshot or a scanned page."""

    font = ImageFont.load_default(size=36)
    image = Image.new("RGB", (1_400, 120 + 70 * len(lines)), "white")
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(lines):
        draw.text((60, 60 + 70 * index), line, fill="black", font=font)
    return image


def scanned_pdf(lines: list[str]) -> bytes:
    buffer = BytesIO()
    text_image(lines).save(buffer, "PDF", resolution=150)
    return buffer.getvalue()


def docx_with_picture(lines: list[str]) -> bytes:
    picture = BytesIO()
    text_image(lines).save(picture, "PNG")
    picture.seek(0)

    document = docx.Document()
    document.add_paragraph("The diagram below summarises hazard analysis steps.")
    document.add_picture(picture)
    document.add_paragraph("Each mitigation must be verified before release.")
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_scanned_pdf_pages_are_read_with_ocr():
    engine = FakeOcrEngine(
        ["Hazard analysis identifies the causes", "of system failures."]
    )

    extracted = extract_document(blank_pdf(), PDF_MIME_TYPE, OcrSession(lambda: engine))
    result = preprocess_document(extracted)

    assert extracted.extractor_name == "pypdf+fake-ocr"
    assert result.sentences == [
        "Hazard analysis identifies the causes of system failures."
    ]
    assert any("with OCR" in warning for warning in result.warnings)


def test_docx_picture_text_keeps_its_position():
    engine = FakeOcrEngine(["Identify every hazard early.", "Analyse their root causes."])

    extracted = extract_document(
        docx_with_picture(["unused by the fake engine"]),
        DOCX_MIME_TYPE,
        OcrSession(lambda: engine),
    )

    assert [block.kind for block in extracted.blocks] == [
        "paragraph",
        "image_text",
        "paragraph",
    ]
    assert preprocess_document(extracted).sentences == [
        "The diagram below summarises hazard analysis steps.",
        "Identify every hazard early.",
        "Analyse their root causes.",
        "Each mitigation must be verified before release.",
    ]


def test_text_documents_never_load_the_ocr_models():
    def fail_to_load():
        raise AssertionError("OCR engine should not be created")

    extract_document(build_pdf(SAFETY_NOTES_PAGES), PDF_MIME_TYPE, OcrSession(fail_to_load))
    extract_document(build_docx(), DOCX_MIME_TYPE, OcrSession(fail_to_load))


def test_ocr_session_skips_icons_and_enforces_the_image_limit():
    engine = FakeOcrEngine(["Readable line of text."])
    session = OcrSession(lambda: engine)

    assert session.read(Image.new("RGB", (40, 40), "white")) == []
    for _ in range(MAX_OCR_IMAGES + 2):
        session.read(Image.new("RGB", (400, 100), "white"))

    assert engine.calls == MAX_OCR_IMAGES
    assert session.images_with_text == MAX_OCR_IMAGES
    assert session.images_skipped == 2
    assert any("OCR limit" in warning for warning in session.warnings())


def test_ocr_session_stops_when_the_time_budget_is_used():
    times = iter([0.0, 0.0, 999.0])
    engine = FakeOcrEngine(["Readable line of text."])
    session = OcrSession(lambda: engine, clock=lambda: next(times))
    image = Image.new("RGB", (400, 100), "white")

    session.read(image)
    session.read(image)

    assert engine.calls == 1
    assert session.images_skipped == 1


def test_real_ocr_reads_a_scanned_pdf_and_a_docx_picture():
    """End-to-end check with the bundled RapidOCR models (runs offline)."""

    engine = RapidOcrEngine()
    lines = [
        "Hazard analysis identifies the causes of failures.",
        "Fault trees show how component failures combine.",
    ]

    pdf_result = preprocess_document(
        extract_document(scanned_pdf(lines), PDF_MIME_TYPE, OcrSession(lambda: engine))
    )
    docx_result = preprocess_document(
        extract_document(
            docx_with_picture(lines), DOCX_MIME_TYPE, OcrSession(lambda: engine)
        )
    )

    for result in (pdf_result, docx_result):
        text = " ".join(result.sentences).lower()
        assert "hazard analysis identifies the causes of failures" in text
        assert "fault trees show how component failures combine" in text


# Processing orchestration ----------------------------------------------------


class FakeDocumentStore:
    def __init__(
        self,
        *,
        content: bytes = b"",
        mime_type: str = PDF_MIME_TYPE,
        status: str | None = "uploaded",
    ) -> None:
        self.content = content
        self.mime_type = mime_type
        self.status = status
        self.saved: DocumentContentRecord | None = None
        self.failure_message: str | None = None
        self.stale_before: datetime | None = None

    def claim_document(self, document_id, *, stale_before):
        self.stale_before = stale_before
        if self.status not in {"uploaded", "failed"}:
            return None
        self.status = "processing"
        return ClaimedDocument(
            id=document_id,
            storage_path="owner/file.pdf",
            mime_type=self.mime_type,
        )

    def document_status(self, document_id):
        return self.status

    def download_learning_material(self, storage_path):
        return self.content

    def save_document_content(self, document_id, content):
        self.saved = content

    def complete_document(self, document_id):
        self.status = "ready"

    def fail_document(self, document_id, message):
        self.status = "failed"
        self.failure_message = message


def fixed_clock() -> datetime:
    return datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc)


def test_processor_stores_content_and_marks_document_ready():
    store = FakeDocumentStore(content=build_pdf(SAFETY_NOTES_PAGES))

    response = DocumentProcessor(store, clock=fixed_clock).process(5)

    assert store.status == "ready"
    assert store.saved is not None
    assert store.saved.sentences == EXPECTED_SAFETY_SENTENCES
    assert store.saved.page_count == 3
    assert len(store.saved.source_sha256) == 64
    assert store.stale_before == datetime(2026, 10, 26, 11, 50, tzinfo=timezone.utc)
    assert response.sentence_count == 4
    assert response.extractor.startswith("pypdf ")


def test_processor_marks_unreadable_files_as_failed():
    store = FakeDocumentStore(content=b"broken")

    with pytest.raises(ExtractionError):
        DocumentProcessor(store).process(5)

    assert store.status == "failed"
    assert store.failure_message is not None
    assert "could not be read" in store.failure_message
    assert store.saved is None


def test_processor_refuses_documents_that_are_not_claimable():
    with pytest.raises(DocumentNotProcessableError, match="already ready"):
        DocumentProcessor(FakeDocumentStore(status="ready")).process(5)
    with pytest.raises(DocumentNotFoundError):
        DocumentProcessor(FakeDocumentStore(status=None)).process(5)


# HTTP route ------------------------------------------------------------------


def test_process_endpoint_requires_token_and_returns_summary(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_INTERNAL_TOKEN", "test-internal-token")
    store = FakeDocumentStore(content=build_docx(), mime_type=DOCX_MIME_TYPE)
    app.dependency_overrides[get_document_processor] = lambda: DocumentProcessor(store)
    client = TestClient(app)

    try:
        unauthorised = client.post("/documents/process", json={"document_id": 9})
        response = client.post(
            "/documents/process",
            json={"document_id": 9},
            headers={"X-Internal-Token": "test-internal-token"},
        )
        conflict = client.post(
            "/documents/process",
            json={"document_id": 9},
            headers={"X-Internal-Token": "test-internal-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert unauthorised.status_code == 401
    assert response.status_code == 200
    body = response.json()
    assert body["document_id"] == 9
    assert body["status"] == "ready"
    assert body["sentence_count"] == 5
    assert body["page_count"] is None
    assert conflict.status_code == 409


def test_process_endpoint_reports_unreadable_files(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_INTERNAL_TOKEN", "test-internal-token")
    store = FakeDocumentStore(content=b"broken")
    app.dependency_overrides[get_document_processor] = lambda: DocumentProcessor(store)
    client = TestClient(app)

    try:
        response = client.post(
            "/documents/process",
            json={"document_id": 9},
            headers={"X-Internal-Token": "test-internal-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert "could not be read" in response.json()["detail"]


# Supabase adapter ------------------------------------------------------------


def build_persistence(handler) -> SupabasePersistence:
    transport = httpx.MockTransport(handler)
    return SupabasePersistence(
        supabase_url="https://example.supabase.co",
        secret_key="sb_secret_test",
        client=httpx.Client(
            base_url="https://example.supabase.co/rest/v1/", transport=transport
        ),
        storage_client=httpx.Client(
            base_url="https://example.supabase.co/storage/v1/", transport=transport
        ),
    )


def test_claim_document_uses_conditional_update():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json=[{"id": 5, "storage_path": "owner/a.pdf", "mime_type": PDF_MIME_TYPE}],
        )

    claimed = build_persistence(handler).claim_document(
        5, stale_before=datetime(2026, 10, 26, 11, 50, tzinfo=timezone.utc)
    )

    assert claimed == ClaimedDocument(5, "owner/a.pdf", PDF_MIME_TYPE)
    request = requests[0]
    assert request.method == "PATCH"
    assert request.url.path == "/rest/v1/documents"
    assert request.url.params["id"] == "eq.5"
    assert request.url.params["or"] == (
        '(status.in.(uploaded,failed),'
        'and(status.eq.processing,updated_at.lt."2026-10-26T11:50:00+00:00"))'
    )
    assert json.loads(request.content) == {"status": "processing", "error_message": None}


def test_claim_document_returns_none_when_no_row_was_updated():
    persistence = build_persistence(lambda request: httpx.Response(200, json=[]))

    assert persistence.claim_document(5, stale_before=fixed_clock()) is None


def test_download_and_save_content_use_storage_and_upsert():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.startswith("/storage/"):
            return httpx.Response(200, content=b"%PDF-bytes")
        return httpx.Response(201)

    persistence = build_persistence(handler)
    content = persistence.download_learning_material("owner-id/abc-notes.pdf")
    persistence.save_document_content(
        5,
        DocumentContentRecord(
            extracted_text="Text.",
            sentences=["A useful sentence."],
            language_code="en",
            extractor_name="pypdf",
            extractor_version="6.10.0",
            source_sha256="a" * 64,
            page_count=1,
            word_count=3,
            warnings=[],
        ),
    )

    assert content == b"%PDF-bytes"
    assert requests[0].url.path == (
        "/storage/v1/object/learning-materials/owner-id/abc-notes.pdf"
    )
    upsert = requests[1]
    assert upsert.url.path == "/rest/v1/document_contents"
    assert upsert.url.params["on_conflict"] == "document_id"
    assert "resolution=merge-duplicates" in upsert.headers["Prefer"]
    assert json.loads(upsert.content)["sentences"] == ["A useful sentence."]
