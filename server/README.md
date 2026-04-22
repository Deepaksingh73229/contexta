# Contexta Enterprise Backend — v3.0.0

> Fully offline, enterprise-grade RAG backend.  
> Stop searching folders. Start finding answers.

---

## What's New in v3.0 (Enterprise Upgrade)

| # | Improvement | File(s) |
|---|-------------|---------|
| 1 | **Embedding-based retrieval** — FAISS replaces LLM traversal | `core/embeddings.py`, `core/retriever.py` |
| 2 | **Hierarchical beam search** — top-K pruning per tree level | `core/retriever.py` → `_beam_search()` |
| 3 | **Hybrid scoring** — 50% semantic + 30% BM25 + 20% metadata | `core/scorer.py` |
| 4 | **Query understanding layer** — intent + entity extraction | `core/query_processor.py` |
| 5 | **Query path cache** — LRU + TTL, persisted to disk | `services/query_cache.py` |
| 6 | **Two-stage + cross-encoder rerank** — fast pass → precise rerank | `core/retriever.py` → `_cross_encoder_rerank()` |
| 7 | **Richer node summaries** — topics, entities, keywords in every summary | `core/builder.py` → `_SUMMARY_PROMPT` |
| 8 | **Context builder optimisation** — dedup + parent-child pruning | `core/retriever.py` → `build_context()` |
| 9 | **Query rewriting** ⭐ NEW | `core/query_processor.py` → `rewrite_query()` |
| 10 | **Multi-query generation** ⭐ NEW | `core/query_processor.py` → `generate_query_variants()` |
| 11 | **Multi-query fusion** — max-score union across all variants | `core/retriever.py` → `retrieve_multi_query()` |
| 12 | **Embedding step at ingest** — every node embedded offline | `core/builder.py` → `embed_tree()` |

---

## Architecture

```
User Query
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Query Processing  (core/query_processor.py)        │
│                                                     │
│  1. Cache lookup  ──────────────────────────────┐   │
│  2. Rewrite query  (LLM aligns to doc vocab)    │   │
│  3. Generate N variants  (diverse phrasings)    │   │
└──────────────────────┬──────────────────────────┘   │
                       │  (cache miss)           hit ─┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  Per-Query Retrieval  (core/retriever.py)           │
│  Runs once per variant, results fused              │
│                                                     │
│  Stage 1: Hierarchical beam search (FAISS)         │
│           L1→top3, L2→top2, L3→top2                │
│                                                     │
│  Stage 2: Hybrid scoring                           │
│           0.50×semantic + 0.30×BM25 + 0.20×meta   │
│                                                     │
│  Stage 3: Cross-encoder rerank (top20 → top5)      │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼  (fusion: max-score union)
┌─────────────────────────────────────────────────────┐
│  Context Builder  (core/retriever.py)               │
│  dedup by embedding sim > 0.92                     │
│  prune parent when child already included          │
│  trim to MAX_CONTEXT_CHARS (8 000)                 │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  LLM Answer Generation  (core/llm.py)              │
│  Ollama local model — no internet, no API key      │
│  Grounded answer + source citations                │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
               Cache store + return
```

---

## Quick Start

### 1. Prerequisites

```bash
# Python 3.11+
# Ollama running locally
ollama pull gemma4:e2b     # or any model — update config.py

# Install dependencies
pip install -e . --break-system-packages

# Download embedding model once (offline after this)
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')"

# Optional: cross-encoder reranker (improves precision, ~50MB)
python -c "from sentence_transformers import CrossEncoder; CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')"
```

### 2. Run the server

```bash
uvicorn main:app --reload --port 8000
```

### 3. Ingest a document

```bash
curl -X POST http://localhost:8000/api/ingest \
  -F "file=@your_document.pdf"
```

Response:
```json
{
  "status": "success",
  "doc_id": "abc123...",
  "filename": "your_document.pdf",
  "nodes": 47,
  "message": "'your_document.pdf' ingested successfully."
}
```

### 4. Query

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "what happens after surgery?"}'
```

The `thinking` field in the response shows you the full query processing trace:
```json
{
  "status": "success",
  "answer": "Post-operative care involves...",
  "sources": [...],
  "thinking": "Original: what happens after surgery?\nRewritten: What are the post-operative patient care and discharge protocols following a surgical procedure?\nVariants (3): What documentation is required before a patient is discharged post-surgery? | Describe the procedure for releasing a patient after an operation. | What are the criteria for inpatient discharge following surgery?"
}
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/api/ingest` | Upload + index a PDF |
| `GET` | `/api/ingest/health` | Ingestion service liveness |
| `POST` | `/api/query` | Query the knowledge base |
| `GET` | `/api/documents` | List all ingested documents |
| `GET` | `/api/cite/{doc_id}` | Stream a PDF for citation preview |
| `GET` | `/api/cache/stats` | Query cache statistics |
| `DELETE` | `/api/cache` | Clear the query cache |

---

## Configuration (config.py)

Key tuning parameters:

```python
# LLM
OLLAMA_MODEL = "gemma4:e2b"           # swap to any Ollama model

# Embedding
EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"  # fully offline after first pull

# Beam search
BEAM_TOP_K_L1 = 3   # chapters to keep
BEAM_TOP_K_L2 = 2   # sections per chapter
BEAM_TOP_K_L3 = 2   # subsections per section

# Hybrid scorer weights (must sum to 1.0)
HYBRID_WEIGHT_SEMANTIC  = 0.50
HYBRID_WEIGHT_BM25      = 0.30
HYBRID_WEIGHT_METADATA  = 0.20

# Multi-query
MULTI_QUERY_COUNT   = 3       # number of variants to generate
QUERY_REWRITE_ENABLED = True  # toggle off to skip rewriting step

# Cross-encoder (optional, high precision)
RERANKER_ENABLED = True
RERANKER_MODEL   = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# Cache
CACHE_ENABLED     = True
CACHE_MAX_ENTRIES = 1_000
CACHE_TTL_SECONDS = 604_800  # 7 days
```

---

## Directory Layout

```
server/
├── main.py                        # FastAPI app entry point
├── config.py                      # All configuration constants
├── pyproject.toml                 # Dependencies
│
├── core/
│   ├── builder.py                 # PDF → tree + summarise + embed
│   ├── embeddings.py              # SentenceTransformer + FAISS
│   ├── llm.py                     # Ollama client (single access point)
│   ├── query_processor.py         # ⭐ Query rewriting + multi-query
│   ├── retriever.py               # Beam search + hybrid + rerank + fusion
│   ├── scorer.py                  # Hybrid scoring (semantic + BM25 + meta)
│   └── tree.py                    # TreeNode dataclass + persistence
│
├── models/
│   └── schemas.py                 # Pydantic request/response models
│
├── routers/
│   ├── citations_router.py        # GET /api/cite/{doc_id}
│   ├── ingest_router.py           # POST /api/ingest
│   └── query_router.py            # POST /api/query, GET /api/documents
│
├── services/
│   ├── ingestion_service.py       # Ingest orchestration (12-step pipeline)
│   ├── query_cache.py             # LRU + TTL query path cache
│   └── query_service.py           # Query orchestration (all 12 improvements)
│
├── documents/                     # Permanent PDF storage (never deleted)
├── tree_indexes/                  # JSON trees + FAISS indexes + meta files
└── query_cache/                   # Persisted query cache JSON
```

---

## Performance Notes

- **Ingestion time**: 1–5 minutes per document (LLM summarisation is the bottleneck). Consider wrapping in a background task + polling endpoint for large batches.
- **Query time**: 2–10 seconds (first call per query). Cache hits return in < 500ms.
- **Cross-encoder**: adds ~1–3s per query. Disable with `RERANKER_ENABLED = False` for latency-sensitive workloads.
- **Multi-query**: adds ~2–5s (3 extra LLM calls for rewriting + variants). Disable with `MULTI_QUERY_ENABLED = False` and `QUERY_REWRITE_ENABLED = False` if needed.

---

## Design Principles

1. **Retrieval system = decision-maker.** The LLM never touches the index during retrieval. FAISS + beam search + hybrid scoring + cross-encoder make all retrieval decisions deterministically.
2. **LLM = answer generator only.** The LLM receives only the final curated context window.
3. **Fully offline.** No API keys, no cloud services, no internet required at runtime.
4. **Transparent.** The `thinking` field in every query response shows exactly what the system did: original query, rewrite, variants, and retrieved node IDs.