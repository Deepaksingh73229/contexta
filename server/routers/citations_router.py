"""
routers/citations_router.py — Stream stored PDFs for citation preview.

Endpoint
--------
  GET /api/cite/{doc_id}   Stream the raw PDF identified by doc_id.

Security
--------
  - doc_id is validated as a 32-character lowercase hex string (UUID4 hex).
    This prevents path-traversal attacks before any filesystem access.
  - The resolved path is confirmed to be inside DOCS_DIR after resolution
    (belt-and-braces containment check).
  - Content-Disposition: inline tells the browser to render the PDF in-tab,
    not trigger a download dialog.
  - Internal file paths are never exposed in error responses.
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


# =============================================================================
#  HELPERS
# =============================================================================

def _resolve_doc(doc_id: str) -> Path:
    """
    Map a doc_id to its stored PDF path with full security validation.

    Validation steps
    ----------------
    1. doc_id must be exactly 32 lowercase alphanumeric characters
       (the format produced by uuid.uuid4().hex).
       This rejects any path-traversal payload before touching the filesystem.
    2. Resolve the candidate path and confirm it is inside DOCS_DIR.
       Defends against symlink attacks or edge cases in Path resolution.
    3. Check the file actually exists (HTTP 404 if not).

    Parameters
    ----------
    doc_id : Raw path parameter string from the URL.

    Returns
    -------
    Resolved, validated Path to the PDF file.
    """
    # Step 1 — format validation.
    if not (len(doc_id) == 32 and doc_id.isalnum() and doc_id.islower()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document ID format.",
        )

    candidate = (DOCS_DIR / f"{doc_id}.pdf").resolve()

    # Step 2 — containment check.
    if not candidate.is_relative_to(DOCS_DIR.resolve()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document ID.",
        )

    # Step 3 — existence check.
    if not candidate.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    return candidate


# =============================================================================
#  ENDPOINT
# =============================================================================

@router.get(
    "/{doc_id}",
    summary="Stream a stored PDF for inline citation preview",
    response_class=FileResponse,
)
def serve_citation(doc_id: str) -> FileResponse:
    """
    Stream the PDF identified by `doc_id` for inline browser rendering.

    Usage from the frontend
    -----------------------
    To open the PDF at a specific page, append the page number as a URL
    fragment *on the client side* — e.g.:
        <a href="/api/cite/abc123#page=4">View source</a>

    PDF fragment navigation (#page=N) is handled entirely by the browser /
    PDF.js viewer, not by the server, so no `page` query parameter is needed.

    The `doc_id` in the URL is the opaque UUID hex returned by POST /api/ingest.
    Original filenames are never exposed in the URL.
    """
    pdf_path = _resolve_doc(doc_id)
    logger.info("Serving citation: doc_id=%s", doc_id)

    return FileResponse(
        path=str(pdf_path),
        media_type=_PDF_MEDIA_TYPE,
        headers={"Content-Disposition": "inline"},
    )