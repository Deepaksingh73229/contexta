"""
services/ingestion_service.py — Document ingestion orchestration.

This service layer sits between the FastAPI router and the core logic.
It owns the workflow: validate → convert → build tree → summarise → persist.

Why a service layer?
--------------------
Routers should be thin: parse HTTP, call service, return response.
Core modules should be pure logic with no knowledge of HTTP or storage.
The service is the glue — it coordinates core modules and handles the
file-system side effects (saving PDFs, writing JSON indexes).

Keeping this separate means you can call ingest_document() from a CLI,
a background task, or a test without going through FastAPI at all.

Public surface
--------------
  ingest_document(file_bytes, original_filename)
      → IngestResponse
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

import aiofiles
from fastapi import HTTPException, status

from config import DOCS_DIR, TREE_DIR, MAX_UPLOAD_BYTES
from core.builder import build_tree, load_document_as_markdown, summarize_tree
from core.tree import save_tree
from models.schemas import IngestResponse

logger = logging.getLogger(__name__)

# PDF magic bytes — first 4 bytes of every valid PDF file.
_PDF_MAGIC: bytes = b"%PDF"


# =============================================================================
#  VALIDATION HELPERS
# =============================================================================

def _safe_filename(raw: str | None) -> str:
    """
    Return only the base filename, stripping all directory components.

    Prevents path-traversal payloads such as:
        "../../etc/passwd"  →  "passwd"
    """
    if not raw:
        return "upload.pdf"
    return Path(raw).name


def _validate_pdf_magic(data: bytes) -> None:
    """
    Raise HTTP 400 if the file does not begin with the PDF magic bytes %PDF.

    Extension checking (filename.endswith(".pdf")) is not sufficient because
    an attacker can rename any file to ".pdf".  Magic-byte validation checks
    the actual file format.
    """
    if not data.startswith(_PDF_MAGIC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid PDF (magic bytes mismatch).",
        )


async def _read_with_size_limit(upload, limit: int) -> bytes:
    """
    Stream an UploadFile into memory, rejecting it if it exceeds `limit` bytes.

    Reading in 64 KB chunks means we reject oversized uploads early without
    buffering the entire payload into RAM first.
    """
    chunks: list[bytes] = []
    total   = 0
    CHUNK   = 64 * 1024   # 64 KB read window

    while True:
        chunk = await upload.read(CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds the {limit // (1024 * 1024)} MB size limit.",
            )
        chunks.append(chunk)

    return b"".join(chunks)


# =============================================================================
#  METADATA STORE HELPERS
# =============================================================================
# We keep a lightweight sidecar metadata file alongside each tree JSON so
# that the document-list endpoint can return filenames without loading every
# full tree index into memory.
#
# Format:  tree_indexes/<doc_id>.meta.json
#   {"doc_id": "abc...", "filename": "policy.pdf", "nodes": 42}

def _meta_path(doc_id: str) -> Path:
    return TREE_DIR / f"{doc_id}.meta.json"


def _write_meta(doc_id: str, filename: str, nodes: int) -> None:
    import json
    meta = {"doc_id": doc_id, "filename": filename, "nodes": nodes}
    _meta_path(doc_id).write_text(
        json.dumps(meta, ensure_ascii=False), encoding="utf-8"
    )


def read_all_meta() -> list[dict]:
    """
    Read all .meta.json sidecar files from TREE_DIR.

    Called by the /api/documents list endpoint.  Reading tiny sidecar files
    is far cheaper than loading and deserialising every full tree JSON.
    """
    import json
    results = []
    for meta_file in sorted(TREE_DIR.glob("*.meta.json")):
        try:
            data = json.loads(meta_file.read_text(encoding="utf-8"))
            results.append(data)
        except Exception as exc:
            logger.warning("Could not read meta file %s: %s", meta_file, exc)
    return results


# =============================================================================
#  PUBLIC SERVICE FUNCTION
# =============================================================================

async def ingest_document(upload, content_type: str | None) -> IngestResponse:
    """
    Full document ingestion pipeline.

    Steps
    -----
    1.  Content-Type pre-check (cheap gate before reading the body).
    2.  Stream the upload body with an enforced size cap.
    3.  PDF magic-byte validation (format, not just extension).
    4.  Persist the raw file permanently to DOCS_DIR under a UUID filename.
    5.  Convert to Markdown (PDF via pymupdf4llm; .md/.txt directly).
    6.  Build the hierarchical tree with build_tree().
    7.  Summarise every node bottom-up with summarize_tree() (LLM calls here).
    8.  Save the complete tree JSON to TREE_DIR.
    9.  Write a sidecar .meta.json for fast listing.

    Parameters
    ----------
    upload       : FastAPI UploadFile object.
    content_type : Value of the Content-Type header (used for pre-check).

    Returns
    -------
    IngestResponse with doc_id, filename, node count, and confirmation message.

    Error handling
    --------------
    - HTTPException is re-raised as-is (safe client message already set).
    - All other exceptions are logged with full detail and re-raised as HTTP 500
      with a generic client message (never exposing internal paths or tracebacks).
    - If persistence fails mid-way, the partially-written PDF is deleted.
    """

    # ── 1. Content-Type pre-check ─────────────────────────────────────────────
    if content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF uploads are accepted.",
        )

    # ── 2. Filename sanitisation ──────────────────────────────────────────────
    original_name = _safe_filename(upload.filename)
    if not original_name.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are supported.",
        )

    # ── 3. Read with size cap ─────────────────────────────────────────────────
    raw_bytes = await _read_with_size_limit(upload, MAX_UPLOAD_BYTES)

    # ── 4. Magic-byte validation ──────────────────────────────────────────────
    _validate_pdf_magic(raw_bytes)

    # ── 5. Assign stable doc_id and persist raw PDF ───────────────────────────
    doc_id       = uuid.uuid4().hex
    pdf_path     = DOCS_DIR / f"{doc_id}.pdf"
    tree_path    = TREE_DIR  / f"{doc_id}.json"

    try:
        async with aiofiles.open(pdf_path, "wb") as fh:
            await fh.write(raw_bytes)

        logger.info(
            "PDF saved: doc_id=%s  original=%s  bytes=%d",
            doc_id, original_name, len(raw_bytes),
        )

        # ── 6. Convert to Markdown ────────────────────────────────────────────
        markdown = load_document_as_markdown(pdf_path)

        # ── 7. Build tree ─────────────────────────────────────────────────────
        tree = build_tree(markdown)
        logger.info("Tree built: doc_id=%s  nodes=%d", doc_id, tree.node_count())

        # ── 8. Summarise (this is where LLM calls happen) ─────────────────────
        logger.info("Summarising tree for doc_id=%s …", doc_id)
        summarize_tree(tree)

        # ── 9. Persist tree index ─────────────────────────────────────────────
        save_tree(tree, tree_path)
        _write_meta(doc_id, original_name, tree.node_count())

        logger.info(
            "Ingestion complete: doc_id=%s  original=%s  nodes=%d",
            doc_id, original_name, tree.node_count(),
        )

        return IngestResponse(
            status   = "success",
            doc_id   = doc_id,
            filename = original_name,
            nodes    = tree.node_count(),
            message  = f"'{original_name}' ingested successfully.",
        )

    except HTTPException:
        raise   # re-raise validation errors as-is

    except Exception as exc:
        logger.exception("Ingestion failed: doc_id=%s  original=%s", doc_id, original_name)
        # Clean up partially-written files.
        pdf_path.unlink(missing_ok=True)
        tree_path.unlink(missing_ok=True)
        _meta_path(doc_id).unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ingestion failed. Please try again or contact support.",
        ) from exc