"""Validated API contracts for content analysis."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


Sentence = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=3, max_length=2_000),
]


class ContentAnalysisRequest(BaseModel):
    """Clean sentences produced by the text-preprocessing module."""

    # FastAPI converts these Pydantic fields into the request form and schema
    # displayed by Swagger at /docs.
    sentences: list[Sentence] = Field(
        min_length=1,
        max_length=500,
        description="Clean, ordered sentences from one learning material.",
    )
    top_keywords: int = Field(
        default=10,
        ge=1,
        le=30,
        description="Maximum number of baseline and semantic keywords.",
    )
    top_sentences: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum number of important sentences to return.",
    )
    max_topics: int = Field(
        default=5,
        ge=1,
        le=10,
        description=(
            "Maximum topic count. The analyser may return fewer topics to avoid "
            "weak or one-sentence clusters."
        ),
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "sentences": [
                    "Software safety requirements address system hazards.",
                    "Hazard analysis identifies causes and mitigation strategies.",
                    "Software reliability measures operation without failure.",
                ],
                "top_keywords": 10,
                "top_sentences": 3,
                "max_topics": 3,
            }
        }
    )

    @field_validator("sentences")
    @classmethod
    def reject_oversized_document(cls, sentences: list[str]) -> list[str]:
        if sum(len(sentence) for sentence in sentences) > 100_000:
            raise ValueError("The combined sentence text must not exceed 100,000 characters.")
        return sentences


class KeywordScore(BaseModel):
    term: str
    score: float
    method: Literal["tfidf", "keybert"]


class ImportantSentence(BaseModel):
    text: str
    score: float
    original_index: int


class TopicResult(BaseModel):
    label: str
    keywords: list[str]
    sentence_indexes: list[int]
    sentences: list[str]


class ConceptResult(BaseModel):
    term: str
    kind: str


class AnalysisModelInfo(BaseModel):
    embedding_model: str
    keyword_method: str
    topic_method: str
    concept_method: str
    trained_for_this_project: bool = False


class ContentAnalysisResponse(BaseModel):
    sentence_count: int
    baseline_keywords: list[KeywordScore]
    semantic_keywords: list[KeywordScore]
    important_sentences: list[ImportantSentence]
    topics: list[TopicResult]
    concepts: list[ConceptResult]
    model: AnalysisModelInfo
