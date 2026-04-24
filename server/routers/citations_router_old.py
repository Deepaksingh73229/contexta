"""
routers/citations_router.py — Stream stored PDFs for inline citation preview.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

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
def serve_citation(doc_id: str) -> FileResponse:
    """Stream the raw PDF for inline browser rendering."""
    pdf_path = _resolve_doc(doc_id)
    logger.info("Serving citation: doc_id=%s", doc_id)
    return FileResponse(path=str(pdf_path), media_type=_PDF_MEDIA_TYPE, headers={"Content-Disposition": "inline"})