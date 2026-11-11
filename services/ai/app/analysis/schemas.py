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
    # All three limits are optional. When omitted, the analyser sizes each
    # output from the material itself (see AnalysisSelection in the response).
    # Sending a value keeps the original fixed-size behaviour.
    top_keywords: int | None = Field(
        default=None,
        ge=1,
        le=30,
        description=(
            "Optional fixed keyword count. Omit it to keep keywords until their "
            "scores drop off (between 5 and 20)."
        ),
    )
    top_sentences: int | None = Field(
        default=None,
        ge=1,
        le=20,
        description=(
            "Optional fixed number of important sentences. Omit it to keep adding "
            "sentences while they still add new, relevant content (between 3 and 12)."
        ),
    )
    max_topics: int | None = Field(
        default=None,
        ge=1,
        le=10,
        description=(
            "Optional upper bound on topics. Omit it to let the silhouette score "
            "choose the clearest number of topics (up to 10)."
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


class AnalysisSelection(BaseModel):
    """How many results were returned and why, for display and reporting."""

    automatic: bool = Field(
        description="True when the request left every limit to the analyser."
    )
    keyword_count: int
    important_sentence_count: int
    topic_count: int
    topic_silhouette: float | None = Field(
        default=None,
        description=(
            "Silhouette score (-1 to 1) of the chosen topic grouping. Higher means "
            "sentences sit more clearly in their own topic. None for one topic."
        ),
    )
    notes: list[str] = Field(
        default_factory=list,
        description="Plain-language reasons for each chosen count.",
    )


class ContentAnalysisResponse(BaseModel):
    sentence_count: int
    baseline_keywords: list[KeywordScore]
    semantic_keywords: list[KeywordScore]
    important_sentences: list[ImportantSentence]
    topics: list[TopicResult]
    concepts: list[ConceptResult]
    model: AnalysisModelInfo
    selection: AnalysisSelection | None = None


class PersistedContentAnalysisRequest(ContentAnalysisRequest):
    """Content-analysis input associated with an existing document row."""

    document_id: int = Field(gt=0)


class PersistedContentAnalysisResponse(ContentAnalysisResponse):
    """Analysis result plus the identifier written to Supabase."""

    analysis_id: int = Field(gt=0)
