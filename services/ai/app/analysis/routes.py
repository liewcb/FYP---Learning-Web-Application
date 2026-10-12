"""HTTP routes for content analysis."""

from functools import lru_cache

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.persistence.dependencies import get_supabase_persistence
from app.persistence.supabase import SupabasePersistence, SupabasePersistenceError
from app.security import require_internal_token

from .schemas import (
    ContentAnalysisRequest,
    ContentAnalysisResponse,
    PersistedContentAnalysisRequest,
    PersistedContentAnalysisResponse,
)
from .service import ContentAnalyzer


router = APIRouter(prefix="/analysis", tags=["analysis"])
logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_content_analyzer() -> ContentAnalyzer:
    """Create the expensive NLP models once, then reuse them for every call."""

    return ContentAnalyzer()


@router.post(
    "/content",
    response_model=ContentAnalysisResponse,
    summary="Analyse learning-material content",
    description=(
        "Accepts preprocessed sentences and returns baseline keywords, semantic "
        "keywords, diverse important sentences, adaptive topics and concepts."
    ),
)
def analyse_content(
    request: ContentAnalysisRequest,
    analyzer: ContentAnalyzer = Depends(get_content_analyzer),
) -> ContentAnalysisResponse:
    """HTTP adapter used by Swagger now and by the Next.js server later.

    FastAPI validates the JSON against ContentAnalysisRequest before this
    function runs. Depends(...) supplies the cached ContentAnalyzer.
    """

    return analyzer.analyse(request)


@router.post(
    "/content-and-save",
    response_model=PersistedContentAnalysisResponse,
    summary="Analyse and persist learning-material content",
    description=(
        "Trusted server-to-server endpoint that records processing state, runs "
        "content analysis and persists the validated result in Supabase."
    ),
)
def analyse_content_and_save(
    request: PersistedContentAnalysisRequest,
    _authorization: None = Depends(require_internal_token),
    analyzer: ContentAnalyzer = Depends(get_content_analyzer),
    persistence: SupabasePersistence = Depends(get_supabase_persistence),
) -> PersistedContentAnalysisResponse:
    try:
        analysis_id = persistence.start_analysis(
            request.document_id,
            request.model_dump(exclude={"document_id", "sentences"}, mode="json"),
        )
    except SupabasePersistenceError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create the analysis record.",
        ) from error

    try:
        result = analyzer.analyse(
            ContentAnalysisRequest.model_validate(
                request.model_dump(exclude={"document_id"})
            )
        )
    except Exception as error:
        _try_fail_analysis(persistence, analysis_id, "Content analysis failed.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Content analysis failed.",
        ) from error

    try:
        persistence.complete_analysis(analysis_id, result)
    except SupabasePersistenceError as error:
        _try_fail_analysis(persistence, analysis_id, "Saving analysis failed.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not save the analysis result.",
        ) from error

    return PersistedContentAnalysisResponse(
        analysis_id=analysis_id,
        **result.model_dump(mode="json"),
    )


def _try_fail_analysis(
    persistence: SupabasePersistence, analysis_id: int, message: str
) -> None:
    try:
        persistence.fail_analysis(analysis_id, message)
    except SupabasePersistenceError:
        logger.exception("Could not record failed analysis %s.", analysis_id)
