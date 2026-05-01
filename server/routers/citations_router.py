"""
routers/citations_router.py — Stream stored PDFs for inline citation preview.

Permission guard: CITATIONS_VIEW (ADMIN, MANAGER, ANALYST, VIEWER)
"""
from __future__ import annotations
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from auth.dependencies import get_current_user_for_embed
from auth.permissions import Permission, has_permission
from auth.store import UserRecord
from config import DOCS_DIR

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cite", tags=["Citations"])
_PDF_MEDIA_TYPE = "application/pdf"


def _resolve_doc(doc_id: str) -> Path:
    if not (len(doc_id) == 32 and doc_id.isalnum() and doc_id.islower()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document ID format.")
    candidate = (DOCS_DIR / f"{doc_id}.pdf").resolve()
    if not candidate.is_relative_to(DOCS_DIR.resolve()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document ID.")
    if not candidate.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return candidate


@router.get("/{doc_id}", response_class=FileResponse)
def serve_citation(
    doc_id:       str,
    current_user: UserRecord = Depends(get_current_user_for_embed),
) -> FileResponse:
    """
    Stream PDF for inline browser rendering.
    Requires: citations:view (ALL roles)
    """
    if not has_permission(current_user.role, Permission.CITATIONS_VIEW):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied. Your role does not have 'citations:view' access.",
        )

    pdf_path = _resolve_doc(doc_id)
    logger.info("Citation: user=%s  doc_id=%s", current_user.username, doc_id)
    return FileResponse(path=str(pdf_path), media_type=_PDF_MEDIA_TYPE,
                        headers={"Content-Disposition": "inline"})
