"""
config.py — Central configuration for the Contexta enterprise backend.

All paths, model names, tunable constants, and feature flags live here.
No other file should hardcode these values.
"""

from __future__ import annotations

from pathlib import Path

# ── Directory layout ───────────────────────────────────────────────────────────
BASE_DIR: Path = Path(__file__).resolve().parent

DOCS_DIR:  Path = BASE_DIR / "documents"
TREE_DIR:  Path = BASE_DIR / "tree_indexes"
CACHE_DIR: Path = BASE_DIR / "query_cache"

DOCS_DIR.mkdir(parents=True, exist_ok=True)
TREE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ── Ollama LLM ─────────────────────────────────────────────────────────────────
OLLAMA_MODEL: str = "gemma4:e2b"

OLLAMA_OPTIONS: dict = {
    "temperature": 0.1,
    "seed":        42,
    "num_ctx":     16384,
}

# ── Embedding model (offline, sentence-transformers) ──────────────────────────
# Used for FAISS node indexing and query embedding.
# Pull once:  python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')"
EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
EMBEDDING_DIM:   int = 384   # bge-small output dimension

# ── Upload limits ──────────────────────────────────────────────────────────────
MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024   # 50 MB

# ── Tree / chunking parameters ─────────────────────────────────────────────────
MAX_SUMMARY_CHARS: int = 5_000
MAX_CONTEXT_CHARS: int = 8_000

# ── Retrieval parameters ───────────────────────────────────────────────────────
# Beam search top-K per level
BEAM_TOP_K_L1: int = 3   # chapter level
BEAM_TOP_K_L2: int = 2   # section level
BEAM_TOP_K_L3: int = 2   # subsection level

# Hybrid scorer weights (must sum to 1.0)
HYBRID_WEIGHT_SEMANTIC:  float = 0.50
HYBRID_WEIGHT_BM25:      float = 0.30
HYBRID_WEIGHT_METADATA:  float = 0.20

# Two-stage retrieval
RETRIEVAL_STAGE1_TOP_N: int = 20   # fast pass candidates
RETRIEVAL_STAGE2_TOP_K: int = 5    # cross-encoder re-rank output

# ── Query rewriting ────────────────────────────────────────────────────────────
QUERY_REWRITE_ENABLED:    bool = True
MULTI_QUERY_COUNT:        int  = 3    # number of query variants to generate
MULTI_QUERY_ENABLED:      bool = True

# ── Query path cache ───────────────────────────────────────────────────────────
CACHE_ENABLED:      bool = True
CACHE_MAX_ENTRIES:  int  = 1_000
CACHE_TTL_SECONDS:  int  = 7 * 24 * 3600   # 7 days

# ── Context builder ────────────────────────────────────────────────────────────
CONTEXT_DEDUP_THRESHOLD: float = 0.92   # cosine sim above which a node is a duplicate
CONTEXT_MERGE_SIBLINGS:  bool  = True

# ── Cross-encoder re-ranking ───────────────────────────────────────────────────
RERANKER_ENABLED: bool  = True
RERANKER_MODEL:   str   = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# ── CORS ───────────────────────────────────────────────────────────────────────
CORS_ORIGINS: list[str] = [
    "http://localhost:3000",
]