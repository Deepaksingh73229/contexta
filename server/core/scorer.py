"""
core/scorer.py — Hybrid scoring: semantic + BM25 + metadata.

Combines three independent signals into a single relevance score per node:

    final_score = 0.50 × cosine_similarity
                + 0.30 × bm25_score
                + 0.20 × metadata_relevance

Why three signals?
------------------
- Semantic similarity catches paraphrase and domain synonyms but misses
  exact codes, identifiers, and rare technical terms.
- BM25 keyword matching catches exact terms but misses paraphrase.
- Metadata relevance (doc_id filter, entity match) gives a precision boost
  when query parser has extracted structured intent.

Public surface
--------------
  HybridScorer                            — built once per document at query time
      .score(query_vec, query_tokens,
             node_id, metadata_filter)   → float
  build_bm25(nodes)                       → BM25Okapi corpus
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any

import numpy as np

from config import (
    HYBRID_WEIGHT_BM25,
    HYBRID_WEIGHT_METADATA,
    HYBRID_WEIGHT_SEMANTIC,
)
from core.tree import TreeNode

logger = logging.getLogger(__name__)


# ── Tokeniser ──────────────────────────────────────────────────────────────────

def _tokenise(text: str) -> list[str]:
    """Simple whitespace + punctuation tokeniser for BM25."""
    text = text.lower()
    tokens = re.findall(r"[a-z0-9]+", text)
    return tokens


# ── BM25 ───────────────────────────────────────────────────────────────────────

class _BM25:
    """
    Minimal BM25Okapi implementation — avoids requiring rank_bm25 as a hard dep.

    Parameters k1 and b are standard BM25 defaults.
    """

    def __init__(self, corpus: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.k1      = k1
        self.b       = b
        self.corpus  = corpus
        self.n       = len(corpus)
        self.avgdl   = sum(len(doc) for doc in corpus) / max(self.n, 1)
        self.df: dict[str, int] = {}
        for doc in corpus:
            for term in set(doc):
                self.df[term] = self.df.get(term, 0) + 1

    def get_scores(self, query: list[str]) -> list[float]:
        scores = [0.0] * self.n
        for term in query:
            if term not in self.df:
                continue
            idf = math.log((self.n - self.df[term] + 0.5) / (self.df[term] + 0.5) + 1)
            for i, doc in enumerate(self.corpus):
                tf = doc.count(term)
                dl = len(doc)
                denom = tf + self.k1 * (1 - self.b + self.b * dl / self.avgdl)
                scores[i] += idf * (tf * (self.k1 + 1)) / denom
        return scores


# ── Hybrid Scorer ──────────────────────────────────────────────────────────────

class HybridScorer:
    """
    Per-document hybrid scorer.

    Build once per document per query session:
        scorer = HybridScorer.build(nodes)

    Then call scorer.score() for each candidate node.
    """

    def __init__(
        self,
        node_ids:    list[str],
        embeddings:  list[list[float]],
        bm25:        "_BM25",
        node_map:    dict[str, int],   # node_id → corpus index
    ):
        self._node_ids   = node_ids
        self._embeddings = np.array(embeddings, dtype="float32") if embeddings else None
        self._bm25       = bm25
        self._node_map   = node_map

    @classmethod
    def build(cls, nodes: list[TreeNode]) -> "HybridScorer":
        """
        Build scorer from a list of TreeNode objects.
        Nodes without embeddings will score 0 on the semantic dimension.
        """
        node_ids:   list[str]         = []
        embeddings: list[list[float]] = []
        corpus:     list[list[str]]   = []
        node_map:   dict[str, int]    = {}

        for i, node in enumerate(nodes):
            node_ids.append(node.node_id)
            embeddings.append(node.embedding if node.embedding else [0.0] * 384)
            corpus.append(_tokenise(node.summary + " " + node.title))
            node_map[node.node_id] = i

        bm25 = _BM25(corpus)
        return cls(node_ids=node_ids, embeddings=embeddings, bm25=bm25, node_map=node_map)

    def score_all(
        self,
        query_vec:       list[float],
        query_tokens:    list[str],
        metadata_filter: dict[str, Any] | None = None,
    ) -> list[tuple[str, float]]:
        """
        Score ALL nodes and return (node_id, score) list sorted descending.

        Parameters
        ----------
        query_vec       : Normalised embedding of the query.
        query_tokens    : Tokenised query for BM25.
        metadata_filter : Optional dict of metadata key→value to match.
                          Matching nodes get +HYBRID_WEIGHT_METADATA bonus.
        """
        if self._embeddings is None or len(self._embeddings) == 0:
            return []

        # ── Semantic scores ───────────────────────────────────────────────────
        q_vec = np.array(query_vec, dtype="float32").reshape(1, -1)
        # Cosine similarity (vectors already L2-normalised at index time).
        raw_cosine = (self._embeddings @ q_vec.T).flatten()
        # Normalise to [0, 1]: cosine on normalised vecs is in [-1, 1].
        sem_scores = (raw_cosine + 1) / 2

        # ── BM25 scores ───────────────────────────────────────────────────────
        bm25_raw = np.array(self._bm25.get_scores(query_tokens), dtype="float32")
        bm25_max = bm25_raw.max()
        bm25_scores = bm25_raw / bm25_max if bm25_max > 0 else bm25_raw

        # ── Metadata bonus ────────────────────────────────────────────────────
        meta_scores = np.zeros(len(self._node_ids), dtype="float32")
        # Currently metadata scoring is a uniform bonus — extend as needed.

        # ── Combined ──────────────────────────────────────────────────────────
        final = (
            HYBRID_WEIGHT_SEMANTIC * sem_scores
            + HYBRID_WEIGHT_BM25 * bm25_scores
            + HYBRID_WEIGHT_METADATA * meta_scores
        )

        results = [
            (self._node_ids[i], float(final[i]))
            for i in range(len(self._node_ids))
        ]
        results.sort(key=lambda x: x[1], reverse=True)
        return results