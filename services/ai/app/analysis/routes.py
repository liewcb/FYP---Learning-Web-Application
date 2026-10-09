"""HTTP routes for content analysis."""

from functools import lru_cache

from fastapi import APIRouter, Depends

from .schemas import ContentAnalysisRequest, ContentAnalysisResponse
from .service import ContentAnalyzer


router = APIRouter(prefix="/analysis", tags=["analysis"])


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
