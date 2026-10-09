"""Local, pretrained NLP pipeline for learning-material analysis."""

from __future__ import annotations

from math import ceil, sqrt
from typing import Any, Literal

import numpy as np
import spacy
from keybert import KeyBERT
from sentence_transformers import SentenceTransformer
from sklearn.cluster import AgglomerativeClustering
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from .schemas import (
    AnalysisModelInfo,
    ConceptResult,
    ContentAnalysisRequest,
    ContentAnalysisResponse,
    ImportantSentence,
    KeywordScore,
    TopicResult,
)


DEFAULT_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_SPACY_MODEL = "en_core_web_sm"
CUSTOM_STOP_WORDS = frozenset({"overall"})


class ContentAnalyzer:
    """Combines a TF-IDF baseline with pretrained semantic NLP models."""

    def __init__(
        self,
        model_name: str = DEFAULT_MODEL_NAME,
        *,
        embedding_model: Any | None = None,
        keyword_model: Any | None = None,
        nlp: Any | None = None,
    ) -> None:
        self.model_name = model_name
        self.embedding_model = embedding_model or SentenceTransformer(model_name)
        self.keyword_model = keyword_model or KeyBERT(model=self.embedding_model)
        self.nlp = nlp or spacy.load(DEFAULT_SPACY_MODEL)

    def analyse(self, request: ContentAnalysisRequest) -> ContentAnalysisResponse:
        sentences = request.sentences
        document_text = " ".join(sentences)

        # MiniLM converts every sentence into a numeric semantic vector.  The
        # same vectors are reused for sentence ranking and topic clustering.
        embeddings = np.asarray(
            self.embedding_model.encode(sentences, normalize_embeddings=True),
            dtype=float,
        )

        # Parse the material once because both keyword and concept extraction
        # use spaCy's noun phrases and named entities.
        parsed_document = self.nlp(document_text)
        topic_labels = self._cluster_labels(embeddings, request.max_topics)

        return ContentAnalysisResponse(
            sentence_count=len(sentences),
            baseline_keywords=self._tfidf_keywords(
                sentences, request.top_keywords, method="tfidf"
            ),
            semantic_keywords=self._semantic_keywords(
                document_text, parsed_document, request.top_keywords
            ),
            important_sentences=self._important_sentences(
                sentences, embeddings, topic_labels, request.top_sentences
            ),
            topics=self._topics(sentences, topic_labels),
            concepts=self._concepts(document_text, parsed_document),
            model=AnalysisModelInfo(
                embedding_model=self.model_name,
                keyword_method=(
                    "KeyBERT with spaCy phrase candidates and maximal marginal relevance"
                ),
                topic_method=(
                    "adaptive agglomerative clustering with TF-IDF labels"
                ),
                concept_method=(
                    f"ranked and cleaned spaCy {DEFAULT_SPACY_MODEL} noun phrases "
                    "and entities"
                ),
            ),
        )

    def _semantic_keywords(
        self, text: str, document: Any, limit: int
    ) -> list[KeywordScore]:
        # Supplying noun phrases prevents KeyBERT from inventing awkward
        # adjacent word combinations such as "operate failure defined".
        candidates = self._phrase_candidates(document)
        if not candidates:
            return []

        extracted = self.keyword_model.extract_keywords(
            text,
            candidates=candidates,
            # KeyBERT still needs an n-gram range wide enough to match the
            # supplied multi-word vocabulary.
            keyphrase_ngram_range=(1, 6),
            stop_words="english",
            use_mmr=True,
            diversity=0.35,
            # Ask for extra candidates because low-quality or duplicate terms
            # are removed below before the public limit is applied.
            top_n=min(limit * 2, len(candidates)),
        )
        results: list[KeywordScore] = []
        seen: set[str] = set()
        for term, score in extracted:
            clean_term = self._clean_phrase(term)
            key = clean_term.casefold()
            if not clean_term or key in seen or float(score) <= 0:
                continue
            seen.add(key)
            results.append(
                KeywordScore(term=clean_term, score=float(score), method="keybert")
            )
            if len(results) == limit:
                break
        return results

    @staticmethod
    def _tfidf_keywords(
        documents: list[str],
        limit: int,
        *,
        method: Literal["tfidf", "keybert"],
    ) -> list[KeywordScore]:
        try:
            vectorizer = TfidfVectorizer(
                stop_words=sorted(ENGLISH_STOP_WORDS | CUSTOM_STOP_WORDS),
                ngram_range=(1, 2),
                lowercase=True,
            )
            matrix = vectorizer.fit_transform(documents)
        except ValueError:
            return []

        scores = np.asarray(matrix.mean(axis=0)).ravel()
        terms = vectorizer.get_feature_names_out()
        ranked = sorted(
            range(len(terms)),
            key=lambda index: (-scores[index], terms[index]),
        )[:limit]
        return [
            KeywordScore(
                term=str(terms[index]),
                score=float(scores[index]),
                method=method,
            )
            for index in ranked
            if scores[index] > 0
        ]

    @staticmethod
    def _important_sentences(
        sentences: list[str],
        embeddings: np.ndarray,
        topic_labels: np.ndarray,
        limit: int,
    ) -> list[ImportantSentence]:
        """Rank central sentences while avoiding near-duplicate selections."""

        centroid = embeddings.mean(axis=0)
        centroid_norm = np.linalg.norm(centroid)
        if centroid_norm:
            centroid = centroid / centroid_norm

        relevance_scores = embeddings @ centroid
        selection_limit = min(limit, len(sentences))
        selected: list[int] = []
        topic_selection_counts: dict[int, int] = {}

        def candidate_score(index: int) -> float:
            redundancy = (
                max(float(embeddings[index] @ embeddings[chosen]) for chosen in selected)
                if selected
                else 0.0
            )
            label = int(topic_labels[index])
            coverage_bonus = 1.0 / (1.0 + topic_selection_counts.get(label, 0))
            return (
                0.60 * float(relevance_scores[index])
                - 0.30 * redundancy
                + 0.10 * coverage_bonus
            )

        def select_best(candidate_indexes: list[int]) -> None:
            best_index = max(
                candidate_indexes,
                key=lambda index: (candidate_score(index), -index),
            )
            selected.append(best_index)
            label = int(topic_labels[best_index])
            topic_selection_counts[label] = topic_selection_counts.get(label, 0) + 1

        # Maximal marginal relevance balances document relevance, novelty and
        # coverage of the detected topics.  This avoids returning many nearly
        # identical sentences from only the dominant topic.
        topic_ids = sorted({int(label) for label in topic_labels})
        guaranteed_per_topic = min(2, selection_limit // len(topic_ids))
        for _round in range(guaranteed_per_topic):
            for topic_id in topic_ids:
                candidates = [
                    index
                    for index, label in enumerate(topic_labels)
                    if int(label) == topic_id and index not in selected
                ]
                if candidates and len(selected) < selection_limit:
                    select_best(candidates)

        while len(selected) < selection_limit:
            select_best(
                [index for index in range(len(sentences)) if index not in selected]
            )

        return [
            ImportantSentence(
                text=sentences[index],
                # Keep the public score interpretable as semantic centrality;
                # the diversity adjustment is used only to choose sentences.
                score=float(relevance_scores[index]),
                original_index=index,
            )
            for index in selected
        ]

    @staticmethod
    def _cluster_labels(
        embeddings: np.ndarray,
        max_topics: int,
    ) -> np.ndarray:
        """Choose up to max_topics coherent clusters without tiny outliers."""

        sentence_count = len(embeddings)
        if sentence_count < 2 or max_topics == 1:
            return np.zeros(sentence_count, dtype=int)

        candidate_limit = min(
            max_topics,
            max(2, round(sqrt(sentence_count))),
            sentence_count - 1,
        )

        # Ward linkage discourages the tiny outlier clusters produced by
        # average linkage for learning notes. Because MiniLM embeddings are
        # normalized, Euclidean distance still reflects semantic similarity.
        minimum_topic_size = 1 if sentence_count < 6 else max(
            2, ceil(sentence_count * 0.10)
        )
        for topic_count in range(candidate_limit, 1, -1):
            labels = AgglomerativeClustering(
                n_clusters=topic_count,
                metric="euclidean",
                linkage="ward",
            ).fit_predict(embeddings)
            cluster_sizes = np.bincount(labels)

            # max_topics is an upper bound. Try fewer clusters until every
            # topic contains enough evidence to be useful to a learner.
            if int(cluster_sizes.min()) >= minimum_topic_size:
                return labels

        return np.zeros(sentence_count, dtype=int)

    def _topics(
        self,
        sentences: list[str],
        labels: np.ndarray,
    ) -> list[TopicResult]:
        grouped: dict[int, list[int]] = {}
        for sentence_index, label in enumerate(labels):
            grouped.setdefault(int(label), []).append(sentence_index)

        ordered_groups = sorted(grouped.values(), key=lambda values: values[0])
        topic_documents = [
            " ".join(sentences[index] for index in indexes)
            for indexes in ordered_groups
        ]
        topic_keywords = self._distinctive_topic_keywords(topic_documents)

        topics: list[TopicResult] = []
        for indexes, keyword_terms in zip(ordered_groups, topic_keywords):
            topic_sentences = [sentences[index] for index in indexes]
            label = keyword_terms[0] if keyword_terms else f"Topic {len(topics) + 1}"
            topics.append(
                TopicResult(
                    label=label,
                    keywords=keyword_terms,
                    sentence_indexes=indexes,
                    sentences=topic_sentences,
                )
            )
        return topics

    @staticmethod
    def _distinctive_topic_keywords(topic_documents: list[str]) -> list[list[str]]:
        """Create labels from terms that distinguish one topic from the others."""

        try:
            vectorizer = TfidfVectorizer(
                stop_words=sorted(ENGLISH_STOP_WORDS | CUSTOM_STOP_WORDS),
                ngram_range=(1, 2),
                lowercase=True,
                sublinear_tf=True,
            )
            matrix = vectorizer.fit_transform(topic_documents).toarray()
        except ValueError:
            return [[] for _document in topic_documents]

        terms = vectorizer.get_feature_names_out()
        term_indexes = {term: index for index, term in enumerate(terms)}
        results: list[list[str]] = []
        for topic_position, row in enumerate(matrix):
            unigram_indexes = [
                index for index, term in enumerate(terms) if " " not in term
            ]
            ranked_unigrams = sorted(
                unigram_indexes,
                key=lambda index: (-row[index], terms[index]),
            )
            top_unigrams = [
                str(terms[index]) for index in ranked_unigrams if row[index] > 0
            ][:5]

            # Prefer an existing phrase made from two highly distinctive
            # words: e.g. "software reliability" or "hazard analysis".
            phrase_label = ""
            for left_position, left in enumerate(top_unigrams):
                for right in top_unigrams[left_position + 1 :]:
                    for candidate in (f"{left} {right}", f"{right} {left}"):
                        candidate_index = term_indexes.get(candidate)
                        if (
                            candidate_index is not None
                            and row[candidate_index] > 0
                            and candidate in topic_documents[topic_position].casefold()
                        ):
                            phrase_label = candidate
                            break
                    if phrase_label:
                        break
                if phrase_label:
                    break

            if not phrase_label:
                phrase_label = " / ".join(top_unigrams[:2])

            supporting_terms = [
                term for term in top_unigrams if term not in phrase_label.split()
            ]
            results.append([phrase_label, *supporting_terms][:3])

        return results

    def _concepts(
        self, text: str, document: Any, limit: int = 30
    ) -> list[ConceptResult]:
        concepts: dict[str, tuple[ConceptResult, float]] = {}

        for noun_phrase in document.noun_chunks:
            tokens = [token for token in noun_phrase if not token.is_space]
            if not tokens or len(tokens) > 6 or all(token.is_stop for token in tokens):
                continue
            self._add_concept(concepts, text, noun_phrase.text, "noun_phrase")

        # Add named entities after noun phrases. General-purpose NER models can
        # misclassify academic terms (for example, a theory name as an ORG), so
        # a matching noun-phrase interpretation takes precedence.
        for entity in document.ents:
            self._add_concept(
                concepts,
                text,
                entity.text,
                f"entity:{entity.label_.lower()}",
                entity_bonus=0.5,
            )

        ranked = sorted(
            concepts.values(),
            key=lambda item: (-item[1], item[0].term.casefold()),
        )
        return [concept for concept, _score in ranked[:limit]]

    @classmethod
    def _add_concept(
        cls,
        concepts: dict[str, tuple[ConceptResult, float]],
        document_text: str,
        term: str,
        kind: str,
        *,
        entity_bonus: float = 0.0,
    ) -> None:
        clean_term = cls._clean_phrase(term)
        key = clean_term.casefold()
        words = key.split()
        is_acronym = clean_term.isupper() and 2 <= len(clean_term) <= 8
        if len(clean_term) < 3 or key in concepts:
            return
        # Single ordinary words tend to be generic extraction noise. Keep
        # acronyms such as MTTR, FMEA and SIL, but prefer multi-word concepts.
        if len(words) == 1 and not is_acronym:
            return
        frequency = document_text.casefold().count(key)
        score = float(frequency) + 0.2 * len(words) + entity_bonus
        concepts[key] = (ConceptResult(term=clean_term, kind=kind), score)

    @classmethod
    def _phrase_candidates(cls, document: Any) -> list[str]:
        """Return readable spaCy phrases for KeyBERT to score."""

        multiword_candidates: dict[str, str] = {}
        singleword_candidates: dict[str, str] = {}
        for span in [*document.noun_chunks, *document.ents]:
            phrase = cls._clean_phrase(span.text)
            words = phrase.split()
            key = phrase.casefold()
            if not phrase or not 1 <= len(words) <= 6:
                continue
            target = multiword_candidates if len(words) > 1 else singleword_candidates
            # Lowercase candidates match KeyBERT's lowercase vectorizer and
            # also make duplicate removal deterministic.
            target.setdefault(key, key)

        # Prefer complete academic phrases. Single words remain a fallback for
        # very short material that contains too few multi-word noun phrases.
        if len(multiword_candidates) >= 3:
            return list(multiword_candidates.values())
        return [*multiword_candidates.values(), *singleword_candidates.values()]

    @staticmethod
    def _clean_phrase(term: str) -> str:
        clean_term = " ".join(term.split()).strip(" ,.;:()[]{}")
        words = clean_term.split()
        while words and words[0].casefold() in {"a", "an", "the", "this", "that"}:
            words.pop(0)
        return " ".join(words)
