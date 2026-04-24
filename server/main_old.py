"""
main.py — Contexta Enterprise FastAPI application.

Startup: resumes any interrupted ingestion tasks automatically.
Shutdown: gracefully drains the worker pool.

Run:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from routers.ingest_router    import router as ingest_router
from routers.query_router     import router as query_router
from routers.citations_router import router as citations_router
from routers.tasks_router     import router as tasks_router
from services import task_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("contexta")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    logger.info("Contexta Enterprise starting up...")
    # Re-queue any tasks that were "running" when the process last died.
    task_manager.startup_resume()
    logger.info("Startup complete.")

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("Contexta shutting down — draining worker pool...")
    task_manager.shutdown()
    logger.info("Shutdown complete.")


app = FastAPI(
    title       = "Contexta Enterprise API",
    description = (
        "Fully offline enterprise RAG backend.\n\n"
        "**Ingestion**: upload → background processing → live progress via /api/tasks.\n\n"
        "**Retrieval**: query rewrite → multi-query → beam search → "
        "hybrid score → cross-encoder rerank → LLM answer."
    ),
    version  = "3.1.0",
    lifespan = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = CORS_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

app.include_router(ingest_router)
app.include_router(tasks_router)
app.include_router(query_router)
app.include_router(citations_router)


@app.get("/", tags=["Health"])
def health_check() -> dict:
    from services.task_store import list_active
    active = list_active()
    return {
        "status":         "active",
        "message":        "Contexta Enterprise API is running.",
        "version":        "3.1.0",
        "active_tasks":   len(active),
    }


@app.get("/demo", tags=["Health"])
def demo() -> dict:
    return {
        "result":   "Connection successful",
        "project":  "Contexta Enterprise — Stop searching folders. Start finding answers.",
        "features": [
            "Background ingestion with live progress (SSE + polling)",
            "Resumable pipelines (survives restarts and power cuts)",
            "Parallel summarisation (ThreadPoolExecutor per document)",
            "Concurrent multi-document ingestion",
            "Checkpoint-based crash recovery",
            "Query rewriting + multi-query generation",
            "Hierarchical beam search (FAISS)",
            "Hybrid scoring (semantic + BM25 + metadata)",
            "Cross-encoder re-ranking",
            "Query path cache (LRU + TTL)",
        ],
    }