"""
routers/ingest_router.py — Document ingestion endpoints.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, UploadFile, status

from models.schemas import IngestResponse
from services.ingestion_service import ingest_document

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ingest", tags=["Ingestion"])


@router.get("/health", status_code=status.HTTP_200_OK)
def ingest_health() -> dict:
    return {"status": "active", "message": "Ingestion service is running."}


@router.post("", response_model=IngestResponse, status_code=status.HTTP_200_OK)
async def ingest_endpoint(file: UploadFile = File(...)) -> IngestResponse:
    """
    Upload and index a PDF.

    Pipeline: validate → store → markdown → tree → summarise → embed → FAISS → save.

    Note: summarisation + embedding makes this endpoint take 1–5 minutes for
    large documents on consumer hardware.  Consider background task + polling
    for production deployments.
    """
    logger.info("Ingest: filename=%r  content_type=%r", file.filename, file.content_type)
    return await ingest_document(file, file.content_type)