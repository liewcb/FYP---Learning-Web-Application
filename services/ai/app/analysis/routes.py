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
from app.quiz.service import GeminiNotConfiguredError

from .service import ContentAnalyzer
from .study_guide import GeminiStudyGuideWriter, StudyGuideError


router = APIRouter(prefix="/analysis", tags=["analysis"])
logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_content_analyzer() -> ContentAnalyzer:
    """Create the expensive NLP models once, then reuse them for every call."""

    return ContentAnalyzer()


@lru_cache(maxsize=1)
def _cached_study_guide_writer() -> GeminiStudyGuideWriter:
    return GeminiStudyGuideWriter()


def get_study_guide_writer() -> GeminiStudyGuideWriter | None:
    """Return the Gemini writer, or None so analysis still works without a key."""

    try:
        return _cached_study_guide_writer()
    except GeminiNotConfiguredError:
        logger.info("No Gemini key configured; returning analysis without a study guide.")
        return None


def _with_study_guide(
    result: ContentAnalysisResponse,
    request: ContentAnalysisRequest,
    writer: GeminiStudyGuideWriter | None,
) -> ContentAnalysisResponse:
    """Add Gemini study notes when possible; the NLP result is kept either way."""

    if writer is None or not request.include_study_guide:
        return result

    try:
        guide = writer.write(list(request.sentences), result)
    except StudyGuideError:
        logger.warning("Study guide unavailable; returning the NLP analysis only.", exc_info=True)
        return result

    return result.model_copy(
        update={
            "study_guide": guide,
            "model": result.model.model_copy(
                update={"study_guide_model": writer.model_name}
            ),
        }
    )


@router.post(
    "/content",
    response_model=ContentAnalysisResponse,
    summary="Analyse learning-material content",
    description=(
        "Accepts preprocessed sentences and returns baseline keywords, semantic "
        "keywords, diverse important sentences, adaptive topics and concepts, "
        "plus a Gemini study guide grounded in the numbered sentences."
    ),
)
def analyse_content(
    request: ContentAnalysisRequest,
    analyzer: ContentAnalyzer = Depends(get_content_analyzer),
    writer: GeminiStudyGuideWriter | None = Depends(get_study_guide_writer),
) -> ContentAnalysisResponse:
    """HTTP adapter used by Swagger now and by the Next.js server later.

    FastAPI validates the JSON against ContentAnalysisRequest before this
    function runs. Depends(...) supplies the cached ContentAnalyzer.
    """

    return _with_study_guide(analyzer.analyse(request), request, writer)


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
    writer: GeminiStudyGuideWriter | None = Depends(get_study_guide_writer),
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

    analysis_request = ContentAnalysisRequest.model_validate(
        request.model_dump(exclude={"document_id"})
    )
    try:
        result = analyzer.analyse(analysis_request)
    except Exception as error:
        _try_fail_analysis(persistence, analysis_id, "Content analysis failed.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Content analysis failed.",
        ) from error

    # Gemini failures never fail the analysis: the NLP result is saved alone.
    result = _with_study_guide(result, analysis_request, writer)

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
