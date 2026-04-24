"""
routers/ingest_router.py — Document ingestion endpoints.

POST /api/ingest  now returns immediately with a task_id.
Track progress via GET /api/tasks/{task_id}.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, UploadFile, status

from models.schemas import TaskAcceptedResponse
from services.ingestion_service import enqueue_ingest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ingest", tags=["Ingestion"])


@router.get("/health", status_code=status.HTTP_200_OK)
def ingest_health() -> dict:
    return {"status": "active", "message": "Ingestion service is running."}


@router.post("", response_model=TaskAcceptedResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_endpoint(file: UploadFile = File(...)) -> TaskAcceptedResponse:
    """
    Upload a PDF and start background ingestion.

    Returns HTTP 202 Accepted immediately with a task_id.
    The file is validated and saved synchronously; all heavy processing
    (LLM summarisation, embedding, FAISS indexing) runs in a background thread.

    Track progress:
      GET /api/tasks/{task_id}          — poll for status + percentage
      GET /api/tasks/{task_id}/stream   — Server-Sent Events live stream
    """
    logger.info("Ingest upload: filename=%r  content_type=%r", file.filename, file.content_type)
    return await enqueue_ingest(file, file.content_type)