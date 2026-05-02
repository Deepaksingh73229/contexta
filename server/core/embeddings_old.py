"""
core/embeddings.py — Offline embedding and FAISS index management.

This module owns all vector operations:
  - SentenceTransformer singleton (loaded once, reused everywhere)
  - embed_text / embed_batch  — produce float32 vectors
  - FaissIndex                — build, save, load, and search a per-document FAISS flat index

No network calls.  The SentenceTransformer model must be downloaded once:
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')"

Public surface
--------------
  embed_text(text)                     → list[float]
  embed_batch(texts)                   → list[list[float]]
  build_faiss_index(nodes)             → FaissIndex
  save_faiss_index(index, path)        → None
  load_faiss_index(path, node_ids)     → FaissIndex
"""

from __future__ import annotations

import logging
import pickle
from pathlib import Path

import numpy as np

from config import EMBEDDING_MODEL, EMBEDDING_DIM, RETRIEVAL_STAGE1_TOP_N

logger = logging.getLogger(__name__)

# ── Singleton embedding model ──────────────────────────────────────────────────
_model = None

def _get_model():
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading embedding model: %s", EMBEDDING_MODEL)
            _model = SentenceTransformer(EMBEDDING_MODEL)
            logger.info("Embedding model ready.")
        except ImportError:
            raise RuntimeError(
                "sentence-transformers is required for embedding.\n"
                "Install: pip install sentence-transformers --break-system-packages"
            )
    return _model


def embed_text(text: str) -> list[float]:
    """Embed a single string → list[float] of length EMBEDDING_DIM."""
    model = _get_model()
    vec = model.encode(text, normalize_embeddings=True)
    return vec.tolist()


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a list of strings efficiently in one batch."""
    if not texts:
        return []
    model = _get_model()
    vecs = model.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
    return vecs.tolist()


# ── FAISS index ────────────────────────────────────────────────────────────────

class FaissIndex:
    """
    Lightweight wrapper around a FAISS flat L2 index.

    Stores the mapping node_id → FAISS integer ID alongside the index
    so search results can be translated back to node IDs.

    Attributes
    ----------
    index    : faiss.IndexFlatIP (inner-product / cosine on normalised vectors)
    node_ids : list[str] — ordered list; position i → faiss id i
    """

    def __init__(self, index, node_ids: list[str]):
        self.index    = index
        self.node_ids = node_ids

    def search(self, query_vec: list[float], top_k: int) -> list[tuple[str, float]]:
        """
        Return up to top_k (node_id, score) pairs, sorted by descending score.

        Parameters
        ----------
        query_vec : Normalised float vector of length EMBEDDING_DIM.
        top_k     : Maximum results to return.

        Returns
        -------
        List of (node_id, cosine_similarity) sorted highest first.
        """
        import faiss
        q = np.array([query_vec], dtype="float32")
        actual_k = min(top_k, self.index.ntotal)
        if actual_k == 0:
            return []
        scores, indices = self.index.search(q, actual_k)
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            results.append((self.node_ids[idx], float(score)))
        return results

    @property
    def size(self) -> int:
        return self.index.ntotal


def build_faiss_index(node_ids: list[str], embeddings: list[list[float]]) -> "FaissIndex":
    """
    Build a FAISS IndexFlatIP (inner-product) index from pre-computed embeddings.

    We use inner product on L2-normalised vectors which equals cosine similarity.
    """
    try:
        import faiss
    except ImportError:
        raise RuntimeError(
            "faiss-cpu is required.\n"
            "Install: pip install faiss-cpu --break-system-packages"
        )

    dim = EMBEDDING_DIM
    index = faiss.IndexFlatIP(dim)
    vectors = np.array(embeddings, dtype="float32")
    faiss.normalize_L2(vectors)
    index.add(vectors)
    logger.info("FAISS index built: %d vectors, dim=%d", index.ntotal, dim)
    return FaissIndex(index=index, node_ids=node_ids)


def save_faiss_index(fi: "FaissIndex", path: Path) -> None:
    """Serialise the FaissIndex to disk using pickle."""
    import faiss
    path.parent.mkdir(parents=True, exist_ok=True)
    faiss.write_index(fi.index, str(path.with_suffix(".faiss")))
    with open(path.with_suffix(".ids"), "wb") as fh:
        pickle.dump(fi.node_ids, fh)
    logger.info("FAISS index saved: %s (%d vectors)", path.stem, fi.index.ntotal)


def load_faiss_index(path: Path) -> "FaissIndex":
    """Load a previously saved FaissIndex from disk."""
    import faiss
    faiss_path = path.with_suffix(".faiss")
    ids_path   = path.with_suffix(".ids")
    if not faiss_path.exists() or not ids_path.exists():
        raise FileNotFoundError(f"FAISS index not found at {faiss_path}")
    index = faiss.read_index(str(faiss_path))
    with open(ids_path, "rb") as fh:
        node_ids = pickle.load(fh)
    logger.info("FAISS index loaded: %s (%d vectors)", path.stem, index.ntotal)
    return FaissIndex(index=index, node_ids=node_ids)