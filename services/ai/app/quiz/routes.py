"""HTTP routes for Gemini quiz generation."""

import logging
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, status

from app.persistence.dependencies import get_supabase_persistence
from app.persistence.supabase import SupabasePersistence, SupabasePersistenceError
from app.security import require_internal_token

from .schemas import (
    PersistedQuizGenerationRequest,
    PersistedQuizGenerationResponse,
    QuizGenerationRequest,
    QuizGenerationResponse,
)
from .service import (
    GeminiNotConfiguredError,
    GeminiQuizGenerator,
    QuizGenerationError,
)


router = APIRouter(prefix="/quiz", tags=["quiz"])
logger = logging.getLogger(__name__)
PROMPT_VERSION = "quiz-v1"


@lru_cache(maxsize=1)
def get_quiz_generator() -> GeminiQuizGenerator:
    """Create one reusable Gemini client for the FastAPI process."""

    try:
        return GeminiQuizGenerator()
    except GeminiNotConfiguredError as error:
        # Dependency construction happens before the route body, so translate
        # configuration failures here to keep Swagger's response meaningful.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error


@router.post(
    "/generate",
    response_model=QuizGenerationResponse,
    summary="Generate a grounded revision quiz",
    description=(
        "Uses Gemini structured output to generate a validated quiz from "
        "preprocessed learning-material sentences. This is a trusted server "
        "endpoint and must not be called directly by the browser in production."
    ),
)
def generate_quiz(
    request: QuizGenerationRequest,
    generator: GeminiQuizGenerator = Depends(get_quiz_generator),
) -> QuizGenerationResponse:
    try:
        return generator.generate(request)
    except GeminiNotConfiguredError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
    except QuizGenerationError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error


@router.post(
    "/generate-and-save",
    response_model=PersistedQuizGenerationResponse,
    summary="Generate and persist a grounded revision quiz",
    description=(
        "Trusted server-to-server endpoint that records generation state, calls "
        "Gemini, validates the result and atomically stores questions and "
        "private answer keys in Supabase."
    ),
)
def generate_and_save_quiz(
    request: PersistedQuizGenerationRequest,
    _authorization: None = Depends(require_internal_token),
    generator: GeminiQuizGenerator = Depends(get_quiz_generator),
    persistence: SupabasePersistence = Depends(get_supabase_persistence),
) -> PersistedQuizGenerationResponse:
    try:
        quiz_id = persistence.start_quiz(
            document_id=request.document_id,
            analysis_id=request.analysis_id,
            title=f"{request.material_title} Quiz"[:200],
            difficulty=request.difficulty,
            requested_question_count=request.question_count,
        )
    except SupabasePersistenceError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create the quiz record.",
        ) from error

    generation_request = QuizGenerationRequest.model_validate(
        request.model_dump(exclude={"document_id", "analysis_id"})
    )
    try:
        result = generator.generate(generation_request)
    except QuizGenerationError as error:
        _try_fail_quiz(persistence, quiz_id, "Gemini quiz generation failed.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error

    try:
        persistence.complete_quiz(
            quiz_id,
            result,
            prompt_version=PROMPT_VERSION,
        )
    except SupabasePersistenceError as error:
        _try_fail_quiz(persistence, quiz_id, "Saving generated quiz failed.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not save the generated quiz.",
        ) from error

    return PersistedQuizGenerationResponse(
        quiz_id=quiz_id,
        **result.model_dump(mode="json"),
    )


def _try_fail_quiz(
    persistence: SupabasePersistence, quiz_id: int, message: str
) -> None:
    try:
        persistence.fail_quiz(quiz_id, message)
    except SupabasePersistenceError:
        logger.exception("Could not record failed quiz %s.", quiz_id)
