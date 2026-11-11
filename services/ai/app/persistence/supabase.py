"""Minimal Supabase Data API adapter for trusted AI-service writes."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx

from app.analysis.schemas import ContentAnalysisResponse
from app.documents.schemas import ClaimedDocument, DocumentContentRecord
from app.quiz.schemas import QuizGenerationResponse


logger = logging.getLogger(__name__)
DEFAULT_TIMEOUT_SECONDS = 20.0
DOWNLOAD_TIMEOUT_SECONDS = 60.0
LEARNING_MATERIALS_BUCKET = "learning-materials"


class SupabaseNotConfiguredError(RuntimeError):
    """Raised when private Supabase server configuration is unavailable."""


class SupabasePersistenceError(RuntimeError):
    """Raised when a trusted Supabase write fails."""


class SupabasePersistence:
    """Persist AI results through PostgREST using a server-only secret key."""

    def __init__(
        self,
        *,
        supabase_url: str | None = None,
        secret_key: str | None = None,
        client: httpx.Client | None = None,
        storage_client: httpx.Client | None = None,
    ) -> None:
        resolved_url = (supabase_url or os.getenv("SUPABASE_URL", "")).rstrip("/")
        resolved_key = secret_key or os.getenv("SUPABASE_SECRET_KEY", "")
        if not resolved_url or not resolved_key:
            raise SupabaseNotConfiguredError(
                "SUPABASE_URL and SUPABASE_SECRET_KEY must be configured."
            )

        self.client = client or httpx.Client(
            base_url=f"{resolved_url}/rest/v1/",
            headers={
                "apikey": resolved_key,
                "Content-Type": "application/json",
            },
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        self.storage_client = storage_client or httpx.Client(
            base_url=f"{resolved_url}/storage/v1/",
            headers={
                "apikey": resolved_key,
                "Authorization": f"Bearer {resolved_key}",
            },
            timeout=DOWNLOAD_TIMEOUT_SECONDS,
        )

    def claim_document(
        self, document_id: int, *, stale_before: datetime
    ) -> ClaimedDocument | None:
        """Atomically move a document into processing if nobody else owns it."""

        cutoff = stale_before.astimezone(timezone.utc).isoformat(timespec="seconds")
        rows = self._request(
            "PATCH",
            "documents",
            params={
                "id": f"eq.{document_id}",
                "or": (
                    "(status.in.(uploaded,failed),"
                    f'and(status.eq.processing,updated_at.lt."{cutoff}"))'
                ),
                "select": "id,storage_path,mime_type",
            },
            headers={"Prefer": "return=representation"},
            json={"status": "processing", "error_message": None},
        )
        if not isinstance(rows, list) or not rows:
            return None

        row = rows[0]
        try:
            return ClaimedDocument(
                id=int(row["id"]),
                storage_path=str(row["storage_path"]),
                mime_type=str(row["mime_type"]),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise SupabasePersistenceError(
                "Supabase returned an invalid document row."
            ) from error

    def document_status(self, document_id: int) -> str | None:
        rows = self._request(
            "GET",
            "documents",
            params={"id": f"eq.{document_id}", "select": "status"},
        )
        if not isinstance(rows, list) or not rows:
            return None
        status = rows[0].get("status") if isinstance(rows[0], dict) else None
        return status if isinstance(status, str) else None

    def download_learning_material(self, storage_path: str) -> bytes:
        response = self._send(
            self.storage_client,
            "GET",
            f"object/{LEARNING_MATERIALS_BUCKET}/{quote(storage_path, safe='/')}",
        )
        return response.content

    def save_document_content(
        self, document_id: int, content: DocumentContentRecord
    ) -> None:
        # Re-processing replaces the previous extraction for the same document.
        self._request(
            "POST",
            "document_contents",
            params={"on_conflict": "document_id"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json={
                "document_id": document_id,
                "extracted_text": content.extracted_text,
                "sentences": content.sentences,
                "language_code": content.language_code,
                "extractor_name": content.extractor_name,
                "extractor_version": content.extractor_version,
                "source_sha256": content.source_sha256,
                "page_count": content.page_count,
                "word_count": content.word_count,
                "warnings": content.warnings,
                "extracted_at": self._now(),
            },
        )

    def complete_document(self, document_id: int) -> None:
        self._request(
            "PATCH",
            "documents",
            params={"id": f"eq.{document_id}", "status": "eq.processing"},
            headers={"Prefer": "return=minimal"},
            json={"status": "ready", "error_message": None},
        )

    def fail_document(self, document_id: int, message: str) -> None:
        self._request(
            "PATCH",
            "documents",
            params={"id": f"eq.{document_id}"},
            headers={"Prefer": "return=minimal"},
            json={"status": "failed", "error_message": message[:2_000]},
        )

    def start_analysis(self, document_id: int, options: dict[str, Any]) -> int:
        rows = self._request(
            "POST",
            "document_analyses",
            params={"select": "id"},
            headers={"Prefer": "return=representation"},
            json={
                "document_id": document_id,
                "status": "processing",
                "request_options": options,
                "started_at": self._now(),
            },
        )
        return self._created_id(rows, "analysis")

    def complete_analysis(
        self, analysis_id: int, result: ContentAnalysisResponse
    ) -> None:
        self._request(
            "PATCH",
            "document_analyses",
            params={"id": f"eq.{analysis_id}"},
            headers={"Prefer": "return=minimal"},
            json={
                "status": "ready",
                "sentence_count": result.sentence_count,
                "baseline_keywords": [
                    item.model_dump(mode="json") for item in result.baseline_keywords
                ],
                "semantic_keywords": [
                    item.model_dump(mode="json") for item in result.semantic_keywords
                ],
                "important_sentences": [
                    item.model_dump(mode="json") for item in result.important_sentences
                ],
                "topics": [item.model_dump(mode="json") for item in result.topics],
                "concepts": [item.model_dump(mode="json") for item in result.concepts],
                # The automatic sizing decision is stored with the model details
                # so saved analyses can explain their counts without a schema change.
                "model_info": {
                    **result.model.model_dump(mode="json"),
                    **(
                        {"selection": result.selection.model_dump(mode="json")}
                        if result.selection is not None
                        else {}
                    ),
                },
                "error_message": None,
                "completed_at": self._now(),
            },
        )

    def fail_analysis(self, analysis_id: int, message: str) -> None:
        self._request(
            "PATCH",
            "document_analyses",
            params={"id": f"eq.{analysis_id}"},
            headers={"Prefer": "return=minimal"},
            json={
                "status": "failed",
                "error_message": message[:2_000],
                "completed_at": self._now(),
            },
        )

    def start_quiz(
        self,
        *,
        document_id: int,
        analysis_id: int,
        title: str,
        difficulty: str,
        requested_question_count: int,
    ) -> int:
        rows = self._request(
            "POST",
            "quizzes",
            params={"select": "id"},
            headers={"Prefer": "return=representation"},
            json={
                "document_id": document_id,
                "analysis_id": analysis_id,
                "title": title,
                "status": "generating",
                "difficulty": difficulty,
                "requested_question_count": requested_question_count,
            },
        )
        return self._created_id(rows, "quiz")

    def complete_quiz(
        self,
        quiz_id: int,
        result: QuizGenerationResponse,
        *,
        prompt_version: str,
    ) -> None:
        self._request(
            "POST",
            "rpc/complete_generated_quiz",
            json={
                "p_quiz_id": quiz_id,
                "p_generation_model": result.model,
                "p_prompt_version": prompt_version,
                "p_questions": [
                    question.model_dump(mode="json") for question in result.questions
                ],
            },
        )

    def fail_quiz(self, quiz_id: int, message: str) -> None:
        self._request(
            "PATCH",
            "quizzes",
            params={"id": f"eq.{quiz_id}"},
            headers={"Prefer": "return=minimal"},
            json={
                "status": "failed",
                "error_message": message[:2_000],
                "completed_at": self._now(),
            },
        )

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self._send(self.client, method, path, **kwargs)

        if response.status_code == 204 or not response.content:
            return None
        try:
            return response.json()
        except ValueError as error:
            raise SupabasePersistenceError(
                "Supabase returned an invalid persistence response."
            ) from error

    @staticmethod
    def _send(
        client: httpx.Client, method: str, path: str, **kwargs: Any
    ) -> httpx.Response:
        try:
            response = client.request(method, path, **kwargs)
            response.raise_for_status()
        except httpx.HTTPError as error:
            status_code = getattr(getattr(error, "response", None), "status_code", None)
            logger.error(
                "Supabase persistence request failed: method=%s path=%s status=%s",
                method,
                path,
                status_code,
            )
            raise SupabasePersistenceError(
                "Supabase persistence request failed."
            ) from error

        return response

    @staticmethod
    def _created_id(rows: Any, resource_name: str) -> int:
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
            raise SupabasePersistenceError(
                f"Supabase did not return the created {resource_name} identifier."
            )
        identifier = rows[0].get("id")
        if not isinstance(identifier, int):
            raise SupabasePersistenceError(
                f"Supabase returned an invalid {resource_name} identifier."
            )
        return identifier

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

