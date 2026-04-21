"""
routers/ingest_router.py — HTTP endpoints for document ingestion.

This router is intentionally thin:
  - Parse the HTTP request.
  - Delegate all business logic to ingestion_service.
  - Return the response.

No business logic, no file I/O, no LLM calls happen here.

Endpoints
---------
  POST /api/ingest          Upload and index a PDF document.
  GET  /api/ingest/health   Liveness probe for the ingestion service.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, UploadFile, status

from models.schemas import IngestResponse
from services.ingestion_service import ingest_document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ingest", tags=["Ingestion"])


# =============================================================================
#  HEALTH CHECK
# =============================================================================

@router.get(
    "/health",
    summary="Ingestion service liveness probe",
    status_code=status.HTTP_200_OK,
)
def ingest_health() -> dict:
    """
    Confirm the ingestion service is reachable.
    The frontend can poll this before showing the upload UI.
    """
    return {
        "status":  "active",
        "message": "Ingestion service is running.",
    }


# =============================================================================
#  INGEST DOCUMENT
# =============================================================================

@router.post(
    "",
    response_model=IngestResponse,
    summary="Upload and index a PDF document",
    status_code=status.HTTP_200_OK,
)
async def ingest_endpoint(file: UploadFile = File(...)) -> IngestResponse:
    """
    Accept a PDF upload, build a hierarchical tree index, and persist it.

    The response includes a `doc_id` which the frontend must store and pass
    to the `/api/query` endpoint to search this document.

    Processing steps (handled by ingestion_service):
      1. Validate Content-Type and file extension.
      2. Stream body with enforced size cap.
      3. PDF magic-byte check.
      4. Save raw PDF permanently (enables later citation streaming).
      5. Convert PDF → Markdown (offline, via pymupdf4llm).
      6. Build hierarchical section tree.
      7. Summarise every node bottom-up via local Ollama LLM.
      8. Persist tree JSON index + sidecar metadata.

    Note: step 7 (summarisation) makes one LLM call per tree node.
    Expect this endpoint to take 30 seconds to several minutes for large
    documents on consumer hardware.  Consider wrapping this in a background
    task with a status-polling endpoint for production use.
    """
    logger.info("Ingest request: filename=%r  content_type=%r", file.filename, file.content_type)
    return await ingest_document(file, file.content_type)