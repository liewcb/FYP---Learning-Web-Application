"""Validated contracts for Gemini quiz generation."""

from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)


QuestionType = Literal["multiple_choice", "true_false", "short_answer"]
Difficulty = Literal["easy", "medium", "hard", "mixed"]
SourceSentence = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=3, max_length=2_000),
]


class QuizGenerationRequest(BaseModel):
    """Trusted text and quiz preferences supplied by the processing flow."""

    material_title: str = Field(min_length=1, max_length=200)
    sentences: list[SourceSentence] = Field(min_length=1, max_length=500)
    question_count: int = Field(default=10, ge=1, le=20)
    difficulty: Difficulty = "mixed"
    question_types: list[QuestionType] = Field(
        default_factory=lambda: ["multiple_choice", "true_false"]
    )

    @field_validator("sentences")
    @classmethod
    def reject_oversized_material(cls, sentences: list[str]) -> list[str]:
        if sum(len(sentence) for sentence in sentences) > 100_000:
            raise ValueError("The combined sentence text must not exceed 100,000 characters.")
        return sentences

    @field_validator("question_types")
    @classmethod
    def require_unique_question_types(
        cls, question_types: list[QuestionType]
    ) -> list[QuestionType]:
        if not question_types:
            raise ValueError("Select at least one question type.")
        if len(question_types) != len(set(question_types)):
            raise ValueError("Question types must not contain duplicates.")
        return question_types

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "material_title": "Software Safety",
                "sentences": [
                    "Software safety requirements address system hazards.",
                    "Hazard analysis identifies causes and mitigation strategies.",
                    "Software reliability measures operation without failure.",
                ],
                "question_count": 5,
                "difficulty": "mixed",
                "question_types": ["multiple_choice", "true_false"],
            }
        }
    )


class GeminiQuestion(BaseModel):
    """Question shape that Gemini must return as structured JSON."""

    question_type: QuestionType
    prompt: str = Field(min_length=1, max_length=2_000)
    options: list[str] = Field(default_factory=list, max_length=6)
    correct_answer: str = Field(min_length=1, max_length=2_000)
    explanation: str = Field(min_length=1, max_length=2_000)
    source_sentence_indexes: list[int] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_options_and_answer(self) -> "GeminiQuestion":
        clean_options = [option.strip() for option in self.options]
        if any(not option for option in clean_options):
            raise ValueError("Question options must not be empty.")
        if len(clean_options) != len(set(clean_options)):
            raise ValueError("Question options must be unique.")

        if self.question_type == "multiple_choice":
            if len(clean_options) != 4:
                raise ValueError("Multiple-choice questions require four options.")
            if self.correct_answer not in clean_options:
                raise ValueError("The correct answer must match one option.")
        elif self.question_type == "true_false":
            if clean_options != ["True", "False"]:
                raise ValueError('True/false options must be ["True", "False"].')
            if self.correct_answer not in clean_options:
                raise ValueError("The correct answer must be True or False.")
        elif clean_options:
            raise ValueError("Short-answer questions must not contain options.")

        self.options = clean_options
        return self


class GeminiQuizOutput(BaseModel):
    """Exact structured output requested from Gemini."""

    title: str = Field(min_length=1, max_length=200)
    questions: list[GeminiQuestion] = Field(min_length=1, max_length=20)


class QuizQuestionResult(GeminiQuestion):
    position: int = Field(ge=1)


class QuizGenerationResponse(BaseModel):
    title: str
    difficulty: Difficulty
    model: str
    questions: list[QuizQuestionResult]


class PersistedQuizGenerationRequest(QuizGenerationRequest):
    """Quiz-generation input linked to persisted document and analysis rows."""

    document_id: int = Field(gt=0)
    analysis_id: int = Field(gt=0)


class PersistedQuizGenerationResponse(QuizGenerationResponse):
    """Generated quiz plus its Supabase identifier."""

    quiz_id: int = Field(gt=0)
