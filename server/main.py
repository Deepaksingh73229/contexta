"""
main.py — Contexta Enterprise FastAPI application v4.0.0

New in v4: Role-Based Authentication (fully offline, JWT + bcrypt).

Run:
    uvicorn main:app --reload --port 8000

First run: check server logs for the default admin credentials.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from routers.auth_router      import router as auth_router
from routers.admin_router     import router as admin_router
from routers.ingest_router    import router as ingest_router
from routers.tasks_router     import router as tasks_router
from routers.query_router     import router as query_router
from routers.citations_router import router as citations_router
from services import task_manager

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt= "%H:%M:%S",
)
logger = logging.getLogger("contexta")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Contexta Enterprise v4.0 starting up...")
    task_manager.startup_resume()
    logger.info("Startup complete.")
    yield
    logger.info("Shutting down — draining worker pool...")
    task_manager.shutdown()
    logger.info("Shutdown complete.")


app = FastAPI(
    title       = "Contexta Enterprise API",
    description = (
        "Fully offline enterprise RAG backend with Role-Based Access Control.\n\n"
        "**Auth**: POST /auth/login → Bearer token → pass in Authorization header.\n\n"
        "**Roles**: admin · manager · analyst · viewer\n\n"
        "**Ingestion**: upload → background processing → SSE progress stream.\n\n"
        "**Retrieval**: Intent Agent → Planner → Parallel Retrieval → Synthesis Agent."
    ),
    version  = "4.0.0",
    lifespan = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = CORS_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Route registration order matters ──────────────────────────────────────────
# Auth routes have no prefix guards — must come first.
app.include_router(auth_router)    # /auth/*
app.include_router(admin_router)   # /admin/*
app.include_router(ingest_router)  # /api/ingest
app.include_router(tasks_router)   # /api/tasks
app.include_router(query_router)   # /api/query, /api/documents, /api/cache
app.include_router(citations_router)  # /api/cite/{doc_id}


@app.get("/", tags=["Health"])
def health_check() -> dict:
    from services.task_store import list_active
    return {
        "status":       "active",
        "message":      "Contexta Enterprise API is running.",
        "version":      "4.0.0",
        "active_tasks": len(list_active()),
        "auth":         "JWT Bearer (offline, HS256)",
    }