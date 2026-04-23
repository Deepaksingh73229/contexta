"""
main.py — Contexta Enterprise FastAPI application.

Run:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from routers.ingest_router    import router as ingest_router
from routers.query_router     import router as query_router
from routers.citations_router import router as citations_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("contexta")

app = FastAPI(
    title       = "Contexta Enterprise API",
    description = (
        "Fully offline enterprise RAG backend.\n\n"
        "**Retrieval pipeline**: query rewrite → multi-query → beam search → "
        "hybrid score → cross-encoder rerank → context build → LLM answer."
    ),
    version = "3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = CORS_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

app.include_router(ingest_router)
app.include_router(query_router)
app.include_router(citations_router)


@app.get("/", tags=["Health"])
def health_check() -> dict:
    return {"status": "active", "message": "Contexta Enterprise API is running.", "version": "3.0.0"}


@app.get("/demo", tags=["Health"])
def demo() -> dict:
    return {
        "result":   "Connection successful",
        "project":  "Contexta Enterprise — Stop searching folders. Start finding answers.",
        "pipeline": [
            "Query rewriting",
            "Multi-query generation",
            "Hierarchical beam search (FAISS)",
            "Hybrid scoring (semantic + BM25 + metadata)",
            "Cross-encoder re-ranking",
            "Multi-query fusion",
            "Context builder (dedup + merge)",
            "LLM answer generation",
            "Query path cache (LRU + TTL)",
        ],
    }