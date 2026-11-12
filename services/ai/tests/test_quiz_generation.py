import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.persistence.dependencies import get_supabase_persistence
from app.quiz.routes import get_quiz_generator
from app.quiz.schemas import QuizGenerationRequest
from app.quiz.service import GeminiQuizGenerator


class FakeInteractions:
    def __init__(self, output: dict):
        self.output = output
        self.last_call = None

    def create(self, **kwargs):
        self.last_call = kwargs
        return SimpleNamespace(output_text=json.dumps(self.output))


class FakeGeminiClient:
    def __init__(self, output: dict):
        self.interactions = FakeInteractions(output)


class TemporaryGeminiError(RuntimeError):
    status_code = 503


class RetryInteractions(FakeInteractions):
    def __init__(self, output: dict):
        super().__init__(output)
        self.call_count = 0

    def create(self, **kwargs):
        self.call_count += 1
        if self.call_count == 1:
            raise TemporaryGeminiError("service temporarily unavailable")
        return super().create(**kwargs)


class FakeQuizPersistence:
    def __init__(self):
        self.started = None
        self.completed = None
        self.failed = None

    def start_quiz(self, **kwargs):
        self.started = kwargs
        return 73

    def complete_quiz(self, quiz_id, result, *, prompt_version, source_sentences=None):
        self.completed = (quiz_id, result, prompt_version)
        self.source_sentences = source_sentences

    def fail_quiz(self, quiz_id, message):
        self.failed = (quiz_id, message)


def quiz_output() -> dict:
    return {
        "title": "Software Safety Check",
        "questions": [
            {
                "question_type": "multiple_choice",
                "prompt": "What does hazard analysis identify?",
                "options": [
                    "Hazards and their causes",
                    "Only source-code formatting",
                    "Only development cost",
                    "Only user-interface colours",
                ],
                "correct_answer": "Hazards and their causes",
                "explanation": "The material states that hazard analysis identifies hazards and causes.",
                "source_sentence_indexes": [0],
            }
        ],
    }


def test_generator_requests_structured_output_and_validates_result():
    fake_client = FakeGeminiClient(quiz_output())
    generator = GeminiQuizGenerator(
        client=fake_client,
        model_name="gemini-test",
    )
    request = QuizGenerationRequest(
        material_title="Software Safety",
        sentences=["Hazard analysis identifies hazards and their causes."],
        question_count=1,
        question_types=["multiple_choice"],
    )

    result = generator.generate(request)

    assert result.model == "gemini-test"
    assert result.questions[0].position == 1
    assert result.questions[0].source_sentence_indexes == [0]
    assert (
        fake_client.interactions.last_call["response_format"]["mime_type"]
        == "application/json"
    )
    provider_schema = fake_client.interactions.last_call["response_format"]["schema"]
    serialized_schema = json.dumps(provider_schema)
    assert "$defs" not in provider_schema
    assert "minLength" not in serialized_schema
    assert "maxLength" not in serialized_schema


def test_generator_retries_temporary_provider_failure(monkeypatch):
    interactions = RetryInteractions(quiz_output())
    client = SimpleNamespace(interactions=interactions)
    generator = GeminiQuizGenerator(client=client, model_name="gemini-test")
    monkeypatch.setattr("app.quiz.service.time.sleep", lambda _delay: None)

    result = generator.generate(
        QuizGenerationRequest(
            material_title="Software Safety",
            sentences=["Hazard analysis identifies hazards and their causes."],
            question_count=1,
            question_types=["multiple_choice"],
        )
    )

    assert interactions.call_count == 2
    assert len(result.questions) == 1


def test_quiz_endpoint_uses_json_contract():
    fake_generator = GeminiQuizGenerator(
        client=FakeGeminiClient(quiz_output()),
        model_name="gemini-test",
    )
    app.dependency_overrides[get_quiz_generator] = lambda: fake_generator
    client = TestClient(app)
    try:
        response = client.post(
            "/quiz/generate",
            json={
                "material_title": "Software Safety",
                "sentences": [
                    "Hazard analysis identifies hazards and their causes."
                ],
                "question_count": 1,
                "difficulty": "mixed",
                "question_types": ["multiple_choice"],
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["questions"][0]["correct_answer"] == (
        "Hazards and their causes"
    )


def test_quiz_endpoint_reports_missing_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    get_quiz_generator.cache_clear()
    client = TestClient(app)

    response = client.post(
        "/quiz/generate",
        json={
            "material_title": "Software Safety",
            "sentences": ["Hazard analysis identifies hazards and their causes."],
            "question_count": 1,
            "difficulty": "mixed",
            "question_types": ["multiple_choice"],
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"].startswith("GEMINI_API_KEY")


def test_generate_and_save_endpoint_persists_validated_quiz(monkeypatch):
    fake_generator = GeminiQuizGenerator(
        client=FakeGeminiClient(quiz_output()),
        model_name="gemini-test",
    )
    persistence = FakeQuizPersistence()
    monkeypatch.setenv("AI_SERVICE_INTERNAL_TOKEN", "test-internal-token")
    app.dependency_overrides[get_quiz_generator] = lambda: fake_generator
    app.dependency_overrides[get_supabase_persistence] = lambda: persistence
    client = TestClient(app)
    try:
        response = client.post(
            "/quiz/generate-and-save",
            headers={"X-Internal-Token": "test-internal-token"},
            json={
                "document_id": 11,
                "analysis_id": 22,
                "material_title": "Software Safety",
                "sentences": [
                    "Hazard analysis identifies hazards and their causes."
                ],
                "question_count": 1,
                "difficulty": "mixed",
                "question_types": ["multiple_choice"],
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["quiz_id"] == 73
    assert persistence.started["document_id"] == 11
    assert persistence.completed[0] == 73
    assert persistence.completed[2] == "quiz-v1"
    # The sentence text is kept so missed questions can be matched to topics.
    assert persistence.source_sentences
