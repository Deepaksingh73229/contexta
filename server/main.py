"""
main.py — Contexta FastAPI application entry point.

This file does THREE things only:
  1. Create the FastAPI app instance.
  2. Register middleware (CORS).
  3. Include all routers.

No business logic, no imports of core modules.  If you need to add a new
feature area, create a new router in routers/ and add one include_router
line here.

Run
---
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from routers.ingest_router   import router as ingest_router
from routers.query_router    import router as query_router
from routers.citations_router import router as citations_router

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("contexta")

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "Contexta API",
    description = "Fully offline vectorless RAG backend for institutional knowledge management.",
    version     = "2.0.0",
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = CORS_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(ingest_router)    # POST /api/ingest, GET /api/ingest/health
app.include_router(query_router)     # POST /api/query,  GET /api/documents
app.include_router(citations_router) # GET  /api/cite/{doc_id}

# ── Root endpoints ─────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def health_check() -> dict:
    """Liveness probe — confirms the API is reachable."""
    return {
        "status":  "active",
        "message": "Contexta API is running.",
    }


@app.get("/demo", tags=["Health"])
def demo() -> dict:
    """Quick sanity check for new developers."""
    return {
        "result":  "Connection successful",
        "project": "Contexta — Stop searching folders. Start finding answers.",
    }