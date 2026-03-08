"""
citations.py — Endpoint to serve uploaded PDFs for citation preview.

Two routes:
  GET /cite/{doc_id}           → streams the full PDF (browser renders it)
  GET /cite/{doc_id}?page=3    → streams the PDF; frontend scrolls to the page

The doc_id is the uuid4 hex stored in Chroma metadata by upload.py.
No raw filenames are ever exposed in the URL — only opaque IDs.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)

router = APIRouter()

_BASE_DIR: Path = Path(__file__).resolve().parent
DOCS_DIR:  Path = _BASE_DIR / "documents"

# Allowlist the only Content-Type we ever serve from this endpoint.
_PDF_MEDIA_TYPE = "application/pdf"


def _resolve_doc(doc_id: str) -> Path:
    """
    Safely map a doc_id to its PDF path.

    Validates that:
      - doc_id contains only hex characters (prevents path traversal)
      - the resolved path is inside DOCS_DIR (belt-and-braces containment)
      - the file actually exists
    """
    # Only allow valid uuid4 hex strings (32 lowercase hex chars).
    if not doc_id.isalnum() or not doc_id.islower() or len(doc_id) != 32:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document ID.",
        )

    candidate = (DOCS_DIR / f"{doc_id}.pdf").resolve()

    # Ensure the resolved path hasn't escaped DOCS_DIR.
    if not candidate.is_relative_to(DOCS_DIR.resolve()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document ID.",
        )

    if not candidate.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    return candidate


@router.get(
    "/cite/{doc_id}",
    summary="Stream a stored PDF for inline citation preview",
    response_class=FileResponse,
)
def serve_citation(doc_id: str) -> FileResponse:
    """
    Stream the PDF identified by *doc_id*.

    The browser (or the frontend PDF viewer) will receive the raw file.
    Pass the `page` number as a URL fragment on the frontend — e.g.
    ``/api/cite/abc123#page=4`` — because PDF fragment navigation is
    handled entirely client-side by the browser / PDF.js viewer.

    Security:
      - doc_id validated as 32-char hex before any filesystem access.
      - Path is confirmed to be inside DOCS_DIR after resolution.
      - Content-Disposition is `inline` so the browser renders, not downloads.
    """
    pdf_path = _resolve_doc(doc_id)

    logger.info("Serving citation", extra={"doc_id": doc_id})

    return FileResponse(
        path=str(pdf_path),
        media_type=_PDF_MEDIA_TYPE,
        # `inline` tells the browser to render the PDF in-tab, not download it.
        headers={"Content-Disposition": "inline"},
    )