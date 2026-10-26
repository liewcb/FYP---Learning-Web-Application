"""HTTP routes for document text extraction and preprocessing."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.persistence.dependencies import get_supabase_persistence
from app.persistence.supabase import SupabasePersistence, SupabasePersistenceError
from app.security import require_internal_token

from .extraction import ExtractionError
from .schemas import DocumentProcessingRequest, DocumentProcessingResponse
from .service import (
    DocumentNotFoundError,
    DocumentNotProcessableError,
    DocumentProcessor,
)


router = APIRouter(prefix="/documents", tags=["documents"])


def get_document_processor(
    persistence: SupabasePersistence = Depends(get_supabase_persistence),
) -> DocumentProcessor:
    return DocumentProcessor(persistence)


@router.post(
    "/process",
    response_model=DocumentProcessingResponse,
    summary="Extract and preprocess an uploaded learning material",
    description=(
        "Trusted server-to-server endpoint. Downloads the private PDF or DOCX, "
        "extracts and cleans its text, splits it into sentences and stores the "
        "result in document_contents. The document status moves from uploaded "
        "or failed to processing, then to ready or failed."
    ),
)
def process_document(
    request: DocumentProcessingRequest,
    _authorization: None = Depends(require_internal_token),
    processor: DocumentProcessor = Depends(get_document_processor),
) -> DocumentProcessingResponse:
    try:
        return processor.process(request.document_id)
    except DocumentNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        ) from error
    except DocumentNotProcessableError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error
    except ExtractionError as error:
        # The message explains what the student can change about the file.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    except SupabasePersistenceError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The document could not be read from or saved to Supabase.",
        ) from error
