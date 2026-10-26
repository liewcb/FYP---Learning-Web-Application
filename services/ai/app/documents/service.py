"""Orchestrate download, extraction, preprocessing and persistence."""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Protocol

from .extraction import ExtractionError, extract_document
from .preprocessing import preprocess_document
from .schemas import ClaimedDocument, DocumentContentRecord, DocumentProcessingResponse


logger = logging.getLogger(__name__)
# A document left in "processing" this long is assumed to belong to a crashed
# worker and may be claimed again. Keep in sync with the web document model.
STALE_PROCESSING_AFTER = timedelta(minutes=10)
UNEXPECTED_FAILURE_MESSAGE = "Text extraction could not be completed. Please try again."


class DocumentStore(Protocol):
    """Persistence operations required by the processing use case."""

    def claim_document(
        self, document_id: int, *, stale_before: datetime
    ) -> ClaimedDocument | None: ...

    def document_status(self, document_id: int) -> str | None: ...

    def download_learning_material(self, storage_path: str) -> bytes: ...

    def save_document_content(
        self, document_id: int, content: DocumentContentRecord
    ) -> None: ...

    def complete_document(self, document_id: int) -> None: ...

    def fail_document(self, document_id: int, message: str) -> None: ...


class DocumentNotFoundError(LookupError):
    """The document does not exist or was deleted."""


class DocumentNotProcessableError(RuntimeError):
    """The document is already ready or currently being processed."""

    def __init__(self, status: str) -> None:
        super().__init__(f"The document is already {status}.")
        self.status = status


class DocumentProcessor:
    def __init__(
        self,
        store: DocumentStore,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self.store = store
        self.clock = clock

    def process(self, document_id: int) -> DocumentProcessingResponse:
        # The conditional claim stops two requests processing the same file.
        claimed = self.store.claim_document(
            document_id, stale_before=self.clock() - STALE_PROCESSING_AFTER
        )
        if claimed is None:
            status = self.store.document_status(document_id)
            if status is None:
                raise DocumentNotFoundError(document_id)
            raise DocumentNotProcessableError(status)

        try:
            content = self.store.download_learning_material(claimed.storage_path)
            extracted = extract_document(content, claimed.mime_type)
            prepared = preprocess_document(extracted)
            record = DocumentContentRecord(
                extracted_text=prepared.text,
                sentences=prepared.sentences,
                language_code=prepared.language_code,
                extractor_name=extracted.extractor_name,
                extractor_version=extracted.extractor_version,
                source_sha256=hashlib.sha256(content).hexdigest(),
                page_count=extracted.page_count,
                word_count=prepared.word_count,
                warnings=prepared.warnings,
            )
            self.store.save_document_content(document_id, record)
            self.store.complete_document(document_id)
        except ExtractionError as error:
            self._try_fail(document_id, str(error))
            raise
        except Exception:
            self._try_fail(document_id, UNEXPECTED_FAILURE_MESSAGE)
            raise

        return DocumentProcessingResponse(
            document_id=document_id,
            page_count=record.page_count,
            word_count=record.word_count,
            character_count=len(record.extracted_text),
            sentence_count=len(record.sentences),
            language_code=record.language_code,
            extractor=f"{record.extractor_name} {record.extractor_version}",
            warnings=record.warnings,
        )

    def _try_fail(self, document_id: int, message: str) -> None:
        try:
            self.store.fail_document(document_id, message)
        except Exception:
            logger.exception("Could not record failed document %s.", document_id)
