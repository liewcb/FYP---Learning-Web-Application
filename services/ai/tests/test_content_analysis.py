from types import SimpleNamespace

import numpy as np
from fastapi.testclient import TestClient

from app.analysis.routes import get_content_analyzer
from app.analysis.schemas import ContentAnalysisRequest
from app.analysis.service import ContentAnalyzer
from app.main import app
from app.persistence.dependencies import get_supabase_persistence


class FakeEmbeddingModel:
    def encode(self, sentences, normalize_embeddings=True):
        vectors = []
        for index, _sentence in enumerate(sentences):
            vectors.append([1.0, float(index % 2), float(index == 2)])
        array = np.asarray(vectors, dtype=float)
        if normalize_embeddings:
            norms = np.linalg.norm(array, axis=1, keepdims=True)
            array = array / np.where(norms == 0, 1, norms)
        return array


class FakeKeywordModel:
    def extract_keywords(self, *_args, **_kwargs):
        return [
            ("database normalization", 0.91),
            ("functional dependency", 0.82),
        ]


class FakeToken:
    def __init__(self, *, is_stop=False):
        self.is_space = False
        self.is_stop = is_stop


class FakeSpan:
    def __init__(self, text, label=""):
        self.text = text
        self.label_ = label
        self._tokens = [FakeToken() for _ in text.split()]

    def __iter__(self):
        return iter(self._tokens)


class FakeNlp:
    def __call__(self, _text):
        return SimpleNamespace(
            ents=[FakeSpan("Third Normal Form", "CONCEPT")],
            noun_chunks=[
                FakeSpan("database normalization"),
                FakeSpan("functional dependencies"),
            ],
        )


def build_analyzer():
    return ContentAnalyzer(
        embedding_model=FakeEmbeddingModel(),
        keyword_model=FakeKeywordModel(),
        nlp=FakeNlp(),
    )


class FakeAnalysisPersistence:
    def __init__(self):
        self.started = None
        self.completed = None
        self.failed = None

    def start_analysis(self, document_id, options):
        self.started = (document_id, options)
        return 52

    def complete_analysis(self, analysis_id, result):
        self.completed = (analysis_id, result)

    def fail_analysis(self, analysis_id, message):
        self.failed = (analysis_id, message)


def test_analyzer_returns_all_reported_content_analysis_outputs():
    analyzer = build_analyzer()
    request = ContentAnalysisRequest(
        sentences=[
            "Database normalization reduces data redundancy.",
            "Functional dependencies describe relationships between attributes.",
            "Third Normal Form removes transitive dependencies.",
            "Normalization improves database consistency.",
        ],
        top_keywords=5,
        top_sentences=2,
        max_topics=2,
    )

    result = analyzer.analyse(request)

    assert result.sentence_count == 4
    assert result.baseline_keywords
    assert result.semantic_keywords[0].term == "database normalization"
    assert len(result.important_sentences) == 2
    assert len(result.topics) == 2
    assert {concept.term for concept in result.concepts} >= {
        "Third Normal Form",
        "database normalization",
    }
    assert result.model.trained_for_this_project is False


def test_content_analysis_endpoint_uses_structured_json_contract():
    app.dependency_overrides[get_content_analyzer] = build_analyzer
    client = TestClient(app)
    try:
        response = client.post(
            "/analysis/content",
            json={
                "sentences": [
                    "Database normalization reduces duplicated data.",
                    "Third Normal Form removes transitive dependencies.",
                ],
                "top_keywords": 3,
                "top_sentences": 1,
                "max_topics": 1,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["sentence_count"] == 2
    assert body["model"]["embedding_model"].endswith("all-MiniLM-L6-v2")
    assert body["semantic_keywords"][0]["method"] == "keybert"


def test_content_analysis_endpoint_rejects_empty_sentences():
    app.dependency_overrides[get_content_analyzer] = build_analyzer
    client = TestClient(app)
    try:
        response = client.post("/analysis/content", json={"sentences": []})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_content_and_save_endpoint_persists_analysis(monkeypatch):
    persistence = FakeAnalysisPersistence()
    monkeypatch.setenv("AI_SERVICE_INTERNAL_TOKEN", "test-internal-token")
    app.dependency_overrides[get_content_analyzer] = build_analyzer
    app.dependency_overrides[get_supabase_persistence] = lambda: persistence
    client = TestClient(app)
    try:
        response = client.post(
            "/analysis/content-and-save",
            headers={"X-Internal-Token": "test-internal-token"},
            json={
                "document_id": 17,
                "sentences": [
                    "Database normalization reduces duplicated data.",
                    "Third Normal Form removes transitive dependencies.",
                ],
                "top_keywords": 3,
                "top_sentences": 1,
                "max_topics": 1,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["analysis_id"] == 52
    assert persistence.started[0] == 17
    assert persistence.completed[0] == 52


def test_clean_phrase_removes_leading_determiners():
    assert ContentAnalyzer._clean_phrase("  a relational database. ") == "relational database"
    assert ContentAnalyzer._clean_phrase("the safety requirements") == "safety requirements"


def test_adaptive_clustering_does_not_return_single_sentence_topics():
    # Two compact semantic groups plus one nearby point that should not become
    # a standalone topic merely because max_topics permits three clusters.
    embeddings = np.asarray(
        [
            [1.0, 0.00],
            [1.0, 0.05],
            [1.0, 0.10],
            [0.00, 1.0],
            [0.05, 1.0],
            [0.10, 1.0],
            [0.15, 1.0],
        ],
        dtype=float,
    )
    embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)

    labels = ContentAnalyzer._cluster_labels(embeddings, max_topics=3)
    cluster_sizes = np.bincount(labels)

    assert len(cluster_sizes) <= 3
    assert cluster_sizes.min() >= 2


class ScoredKeywordModel:
    """Returns a score curve with a clear drop after the sixth keyword."""

    def __init__(self, scores):
        self.scores = scores

    def extract_keywords(self, *_args, **kwargs):
        top_n = kwargs.get("top_n", len(self.scores))
        return [
            (f"concept phrase {index}", score)
            for index, score in enumerate(self.scores[:top_n])
        ]


class ManyPhraseNlp:
    def __call__(self, _text):
        return SimpleNamespace(
            ents=[],
            noun_chunks=[FakeSpan(f"concept phrase {index}") for index in range(30)],
        )


class TwoTopicEmbeddingModel:
    """Sentences alternate between two clearly separated semantic groups."""

    def encode(self, sentences, normalize_embeddings=True):
        vectors = []
        for index, _sentence in enumerate(sentences):
            jitter = 0.02 * (index % 5)
            vectors.append([1.0, jitter, 0.0] if index % 2 == 0 else [0.0, jitter, 1.0])
        array = np.asarray(vectors, dtype=float)
        return array / np.linalg.norm(array, axis=1, keepdims=True)


def _sentences(count):
    return [f"Sentence number {index} explains a learning concept." for index in range(count)]


def test_limits_are_optional_and_selection_is_reported():
    analyzer = build_analyzer()
    result = analyzer.analyse(
        ContentAnalysisRequest(sentences=_sentences(4))
    )

    assert result.selection is not None
    assert result.selection.automatic is True
    assert result.selection.keyword_count == len(result.semantic_keywords)
    assert result.selection.important_sentence_count == len(result.important_sentences)
    assert result.selection.topic_count == len(result.topics)
    assert len(result.selection.notes) == 3


def test_fixed_limits_keep_the_original_behaviour():
    analyzer = build_analyzer()
    result = analyzer.analyse(
        ContentAnalysisRequest(sentences=_sentences(10), top_sentences=4, max_topics=1)
    )

    assert len(result.important_sentences) == 4
    assert len(result.topics) == 1
    assert result.selection.automatic is False


def test_adaptive_count_stops_at_the_knee():
    scores = [0.80, 0.78, 0.76, 0.75, 0.74, 0.73, 0.40, 0.39, 0.38, 0.37]

    assert ContentAnalyzer._adaptive_count(scores, 5, 20) == 6


def test_adaptive_count_respects_the_relative_floor_and_bounds():
    gentle = [0.90 - 0.03 * index for index in range(25)]

    count = ContentAnalyzer._adaptive_count(gentle, 5, 20)

    # 60% of 0.90 is 0.54, reached after 13 keywords on this smooth curve.
    assert count == 13
    assert ContentAnalyzer._adaptive_count([0.5, 0.4], 5, 20) == 2
    assert ContentAnalyzer._adaptive_count([0.9] * 30, 5, 20) == 20


def test_automatic_keywords_follow_the_score_curve():
    analyzer = ContentAnalyzer(
        embedding_model=FakeEmbeddingModel(),
        keyword_model=ScoredKeywordModel(
            [0.80, 0.78, 0.76, 0.75, 0.74, 0.73, 0.40, 0.39, 0.38, 0.37, 0.36, 0.35]
        ),
        nlp=ManyPhraseNlp(),
    )

    result = analyzer.analyse(ContentAnalysisRequest(sentences=_sentences(6)))

    assert len(result.semantic_keywords) == 6
    assert len(result.baseline_keywords) <= 6


def test_silhouette_picks_the_natural_number_of_topics():
    analyzer = ContentAnalyzer(
        embedding_model=TwoTopicEmbeddingModel(),
        keyword_model=FakeKeywordModel(),
        nlp=FakeNlp(),
    )

    result = analyzer.analyse(ContentAnalysisRequest(sentences=_sentences(40)))

    assert len(result.topics) == 2
    assert result.selection.topic_silhouette is not None
    assert result.selection.topic_silhouette > 0.5


def test_automatic_sentences_cover_topics_and_stay_proportional():
    analyzer = ContentAnalyzer(
        embedding_model=TwoTopicEmbeddingModel(),
        keyword_model=FakeKeywordModel(),
        nlp=FakeNlp(),
    )

    result = analyzer.analyse(ContentAnalysisRequest(sentences=_sentences(40)))
    chosen_groups = {sentence.original_index % 2 for sentence in result.important_sentences}

    assert 3 <= len(result.important_sentences) <= 4  # at most 10% of 40
    assert chosen_groups == {0, 1}


def test_content_endpoint_accepts_sentences_only():
    app.dependency_overrides[get_content_analyzer] = build_analyzer
    client = TestClient(app)
    try:
        response = client.post(
            "/analysis/content",
            json={"sentences": _sentences(5)},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["selection"]["automatic"] is True
