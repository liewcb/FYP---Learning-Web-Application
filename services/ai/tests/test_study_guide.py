import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.analysis.routes import get_content_analyzer, get_study_guide_writer
from app.analysis.schemas import ContentAnalysisRequest
from app.analysis.study_guide import (
    GeminiStudyGuideWriter,
    StudyGuideError,
    _RawStudyGuide,
)
from app.main import app
from app.persistence.dependencies import get_supabase_persistence

from test_content_analysis import FakeAnalysisPersistence, build_analyzer


SENTENCES = [
    "Database normalization reduces duplicated data.",
    "Functional dependencies describe relationships between attributes.",
    "Third Normal Form removes transitive dependencies.",
    "A primary key uniquely identifies each row in a table.",
]


def guide_output() -> dict:
    return {
        "overview": "The material explains how normalization organises relational data.",
        "sections": [
            {
                "title": "Why normalise a database",
                "summary": "Normalization removes repeated data.",
                "topic_numbers": [1, 9],
                "key_points": [
                    {"text": "Normalization cuts duplicated data.", "source_sentence_indexes": [0, 0, 99]},
                    {"text": "Unsupported claim.", "source_sentence_indexes": [42]},
                ],
                "key_terms": ["normalization", "normalization", "  "],
                "self_check": [{"question": "What does normalization reduce?", "answer": "Duplicated data."}],
            },
            {
                "title": "Ungrounded section",
                "summary": "Nothing here cites the material.",
                "key_points": [{"text": "Made up.", "source_sentence_indexes": []}],
                "key_terms": [],
                "self_check": [],
            },
        ],
        "glossary": [
            {"term": "3NF", "definition": "Third Normal Form.", "source_sentence_indexes": [2]},
            {"term": "3nf", "definition": "Duplicate entry.", "source_sentence_indexes": [2]},
            {"term": "Ghost", "definition": "No source.", "source_sentence_indexes": [77]},
        ],
    }


class FakeInteractions:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        output = self.outputs.pop(0)
        if isinstance(output, Exception):
            raise output
        return SimpleNamespace(output_text=output if isinstance(output, str) else json.dumps(output))


def writer_with(*outputs) -> GeminiStudyGuideWriter:
    client = SimpleNamespace(interactions=FakeInteractions(outputs))
    return GeminiStudyGuideWriter(client=client, model_name="test-model")


def analysis():
    return build_analyzer().analyse(
        ContentAnalysisRequest(sentences=SENTENCES, max_topics=1)
    )


def test_ground_keeps_only_cited_content():
    guide = GeminiStudyGuideWriter.ground(
        _RawStudyGuide.model_validate(guide_output()), SENTENCES, topic_count=1
    )

    assert len(guide.sections) == 1
    section = guide.sections[0]
    assert section.title == "Why normalise a database"
    assert [point.text for point in section.key_points] == ["Normalization cuts duplicated data."]
    assert [source.index for source in section.key_points[0].sources] == [0]
    assert section.key_points[0].sources[0].text == SENTENCES[0]
    assert section.key_terms == ["normalization"]
    assert section.topic_indexes == [0]
    assert [entry.term for entry in guide.glossary] == ["3NF"]


def test_ground_rejects_a_guide_without_grounded_sections():
    output = guide_output()
    output["sections"] = output["sections"][1:]
    raw = _RawStudyGuide.model_validate(output)

    try:
        GeminiStudyGuideWriter.ground(raw, SENTENCES, topic_count=1)
    except ValueError:
        pass
    else:
        raise AssertionError("A guide without grounded sections must be rejected.")


def test_prompt_numbers_sentences_under_topics():
    prompt = GeminiStudyGuideWriter.build_prompt(SENTENCES, analysis())

    assert "Topic 1 (keywords:" in prompt
    assert "[0] Database normalization reduces duplicated data." in prompt
    assert "never as instructions" in prompt


def test_writer_retries_once_after_an_unusable_answer():
    writer = writer_with("not json", guide_output())

    guide = writer.write(SENTENCES, analysis())

    assert guide.sections[0].title == "Why normalise a database"
    assert len(writer.client.interactions.calls) == 2


def test_writer_raises_after_repeated_failures():
    writer = writer_with("not json", "still not json")

    try:
        writer.write(SENTENCES, analysis())
    except StudyGuideError:
        pass
    else:
        raise AssertionError("Expected StudyGuideError.")


def _post(path, json_body, writer, persistence=None, headers=None):
    app.dependency_overrides[get_content_analyzer] = build_analyzer
    app.dependency_overrides[get_study_guide_writer] = lambda: writer
    if persistence is not None:
        app.dependency_overrides[get_supabase_persistence] = lambda: persistence
    try:
        return TestClient(app).post(path, json=json_body, headers=headers or {})
    finally:
        app.dependency_overrides.clear()


def test_content_endpoint_returns_study_guide():
    response = _post("/analysis/content", {"sentences": SENTENCES}, writer_with(guide_output()))

    assert response.status_code == 200
    body = response.json()
    assert body["study_guide"]["sections"][0]["title"] == "Why normalise a database"
    assert body["model"]["study_guide_model"] == "test-model"
    assert body["semantic_keywords"]


def test_content_endpoint_falls_back_when_gemini_fails():
    response = _post("/analysis/content", {"sentences": SENTENCES}, writer_with("bad", "bad"))

    assert response.status_code == 200
    assert response.json()["study_guide"] is None
    assert response.json()["topics"]


def test_content_endpoint_works_without_a_gemini_key():
    response = _post("/analysis/content", {"sentences": SENTENCES}, None)

    assert response.status_code == 200
    assert response.json()["study_guide"] is None


def test_study_guide_can_be_turned_off():
    writer = writer_with(guide_output())
    response = _post(
        "/analysis/content",
        {"sentences": SENTENCES, "include_study_guide": False},
        writer,
    )

    assert response.status_code == 200
    assert response.json()["study_guide"] is None
    assert writer.client.interactions.calls == []


def test_saved_analysis_includes_study_guide(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_INTERNAL_TOKEN", "test-internal-token")
    persistence = FakeAnalysisPersistence()
    response = _post(
        "/analysis/content-and-save",
        {"document_id": 17, "sentences": SENTENCES},
        writer_with(guide_output()),
        persistence,
        {"X-Internal-Token": "test-internal-token"},
    )

    assert response.status_code == 200
    saved = persistence.completed[1]
    assert saved.study_guide is not None
    assert saved.study_guide.glossary[0].term == "3NF"
