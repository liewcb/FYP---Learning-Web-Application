import json

import httpx

from app.persistence.supabase import SupabasePersistence
from app.quiz.schemas import QuizGenerationResponse


def test_persistence_uses_secret_key_and_rest_base_path():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(201, json=[{"id": 41}])

    client = httpx.Client(
        base_url="https://example.supabase.co/rest/v1/",
        headers={"apikey": "sb_secret_test"},
        transport=httpx.MockTransport(handler),
    )
    persistence = SupabasePersistence(
        supabase_url="https://example.supabase.co",
        secret_key="sb_secret_test",
        client=client,
    )

    analysis_id = persistence.start_analysis(7, {"top_keywords": 10})

    assert analysis_id == 41
    assert requests[0].url.path == "/rest/v1/document_analyses"
    assert requests[0].headers["apikey"] == "sb_secret_test"
    assert json.loads(requests[0].content)["document_id"] == 7


def test_complete_quiz_calls_atomic_database_function():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=73)

    client = httpx.Client(
        base_url="https://example.supabase.co/rest/v1/",
        headers={"apikey": "sb_secret_test"},
        transport=httpx.MockTransport(handler),
    )
    persistence = SupabasePersistence(
        supabase_url="https://example.supabase.co",
        secret_key="sb_secret_test",
        client=client,
    )
    result = QuizGenerationResponse.model_validate(
        {
            "title": "Safety Quiz",
            "difficulty": "mixed",
            "model": "gemini-test",
            "questions": [
                {
                    "position": 1,
                    "question_type": "true_false",
                    "prompt": "Hazard analysis identifies hazards.",
                    "options": ["True", "False"],
                    "correct_answer": "True",
                    "explanation": "The source states this directly.",
                    "source_sentence_indexes": [0],
                }
            ],
        }
    )

    persistence.complete_quiz(
        73,
        result,
        prompt_version="quiz-v1",
        source_sentences=["Hazard analysis identifies hazards and their causes."],
    )

    assert requests[0].url.path == "/rest/v1/rpc/complete_generated_quiz"
    payload = json.loads(requests[0].content)
    assert payload["p_quiz_id"] == 73
    assert payload["p_questions"][0]["correct_answer"] == "True"
    assert payload["p_questions"][0]["source_sentences"] == [
        "Hazard analysis identifies hazards and their causes."
    ]
