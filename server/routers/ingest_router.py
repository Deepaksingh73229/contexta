"""
routers/ingest_router.py — Document ingestion endpoints.

Permission guard: INGEST_CREATE
"""
from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, File, UploadFile, status
from auth.dependencies import require_permission
from auth.permissions import Permission
from auth.store import UserRecord
from models.schemas import TaskAcceptedResponse
from services.ingestion_service import enqueue_ingest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ingest", tags=["Ingestion"])


@router.get("/health", status_code=status.HTTP_200_OK)
def ingest_health() -> dict:
    """Liveness probe — public, no auth required."""
    return {"status": "active", "message": "Ingestion service is running."}


@router.post("", response_model=TaskAcceptedResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_endpoint(
    file:    UploadFile  = File(...),
    current_user: UserRecord = Depends(require_permission(Permission.INGEST_CREATE)),
) -> TaskAcceptedResponse:
    """
    Upload a PDF and start background ingestion.

    Requires: ingest:create (ADMIN, MANAGER)

    Returns HTTP 202 immediately with a task_id.
    Track progress: GET /api/tasks/{task_id}
    """
    logger.info("Ingest upload: user=%s  file=%r", current_user.username, file.filename)
    from auth.store import audit
    result = await enqueue_ingest(file, file.content_type)
    audit(current_user.user_id, "ingest.create", f"Uploaded '{file.filename}' → task {result.task_id}")
    return result