"""Validated contracts for document text extraction and preprocessing."""

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DocumentProcessingRequest(BaseModel):
    """Identifier of an uploaded document whose ownership the web server checked."""

    document_id: int = Field(gt=0)

    model_config = ConfigDict(json_schema_extra={"example": {"document_id": 12}})


class DocumentProcessingResponse(BaseModel):
    """Summary of the stored extraction and preprocessing result."""

    document_id: int
    status: Literal["ready"] = "ready"
    page_count: int | None = Field(
        description="Number of PDF pages, or null for DOCX files."
    )
    word_count: int
    character_count: int
    sentence_count: int
    language_code: str
    extractor: str = Field(description="Library and version that read the file.")
    warnings: list[str]


@dataclass(frozen=True)
class ClaimedDocument:
    """Document row that this worker moved into the processing state."""

    id: int
    storage_path: str
    mime_type: str


@dataclass(frozen=True)
class DocumentContentRecord:
    """Row written to public.document_contents."""

    extracted_text: str
    sentences: list[str]
    language_code: str
    extractor_name: str
    extractor_version: str
    source_sha256: str
    page_count: int | None
    word_count: int
    warnings: list[str]
