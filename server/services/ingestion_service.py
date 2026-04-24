"""
services/ingestion_service.py — Ingestion HTTP layer (thin, async-safe).

Role
----
This module is now THIN.  It:
  1. Validates the uploaded file (Content-Type, extension, size, magic bytes).
  2. Saves the raw PDF to DOCS_DIR.
  3. Creates a TaskRecord in the task store.
  4. Submits the task to the background worker pool.
  5. Returns a TaskAcceptedResponse immediately — no blocking LLM calls here.

All actual pipeline work (markdown conversion, tree building, summarisation,
embedding, FAISS indexing) happens asynchronously in task_manager workers.

The old synchronous ingest_document() function is replaced by this thin
enqueue-and-return flow.  Progress can be tracked via GET /api/tasks/{task_id}.
"""

from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile, status

from config import DOCS_DIR, TREE_DIR, MAX_UPLOAD_BYTES
from models.schemas import TaskAcceptedResponse
from services import task_manager, task_store

logger = logging.getLogger(__name__)

_PDF_MAGIC: bytes = b"%PDF"


# ── Validation helpers ─────────────────────────────────────────────────────────

def _safe_filename(raw: str | None) -> str:
    if not raw:
        return "upload.pdf"
    return Path(raw).name


def _validate_pdf_magic(data: bytes) -> None:
    if not data.startswith(_PDF_MAGIC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid PDF (magic bytes mismatch).",
        )


async def _read_with_size_limit(upload: UploadFile, limit: int) -> bytes:
    chunks: list[bytes] = []
    total   = 0
    CHUNK   = 64 * 1024

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


# ── Metadata helpers (used by query service) ───────────────────────────────────

def _meta_path(doc_id: str) -> Path:
    return TREE_DIR / f"{doc_id}.meta.json"


def read_all_meta() -> list[dict]:
    results = []
    for meta_file in sorted(TREE_DIR.glob("*.meta.json")):
        try:
            data = json.loads(meta_file.read_text(encoding="utf-8"))
            results.append(data)
        except Exception as exc:
            logger.warning("Could not read meta file %s: %s", meta_file, exc)
    return results


def get_doc_titles() -> str:
    metas = read_all_meta()
    return ", ".join(m.get("filename", "") for m in metas if m.get("filename"))


# ── Public entry point ─────────────────────────────────────────────────────────

async def enqueue_ingest(upload: UploadFile, content_type: str | None) -> TaskAcceptedResponse:
    """
    Validate, save, and enqueue an ingestion task.

    Returns immediately with a task_id.  The caller polls
    GET /api/tasks/{task_id} for live progress.
    """
    # ── 1. Content-Type ───────────────────────────────────────────────────────
    if content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF uploads are accepted.",
        )

    # ── 2. Filename ───────────────────────────────────────────────────────────
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

    # ── 5. Persist raw PDF permanently ───────────────────────────────────────
    doc_id   = uuid.uuid4().hex
    pdf_path = DOCS_DIR / f"{doc_id}.pdf"

    try:
        async with aiofiles.open(pdf_path, "wb") as fh:
            await fh.write(raw_bytes)
        logger.info("PDF saved: doc_id=%s  original=%s  bytes=%d",
                    doc_id, original_name, len(raw_bytes))
    except Exception as exc:
        pdf_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save uploaded file.",
        ) from exc

    # ── 6. Create task record ─────────────────────────────────────────────────
    rec = task_store.create(doc_id=doc_id, filename=original_name)

    # Mark PDF as uploaded (stage 1 complete).
    task_store.mark_stage(rec.task_id, "uploaded", pct=5.0)

    # ── 7. Submit to background worker pool ──────────────────────────────────
    task_manager.submit(rec.task_id, doc_id, original_name)

    logger.info("Ingestion enqueued: task_id=%s  doc_id=%s", rec.task_id, doc_id)

    return TaskAcceptedResponse(
        status   = "accepted",
        task_id  = rec.task_id,
        doc_id   = doc_id,
        filename = original_name,
        message  = (
            f"'{original_name}' uploaded successfully. "
            f"Processing in background. Poll /api/tasks/{rec.task_id} for progress."
        ),
    )