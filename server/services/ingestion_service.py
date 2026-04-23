"""
services/ingestion_service.py — Enterprise document ingestion orchestration.

Pipeline (9 steps):
  1.  Content-Type pre-check
  2.  Filename sanitisation + extension check
  3.  Stream with size cap
  4.  PDF magic-byte validation
  5.  Persist raw PDF permanently
  6.  Convert PDF → Markdown (pymupdf4llm, offline)
  7.  Build hierarchical tree (core/builder.py)
  8.  Summarise nodes bottom-up with richer prompts (LLM calls here)
  9.  Embed every node summary (sentence-transformer, offline)  ← NEW
  10. Build + save FAISS index                                   ← NEW
  11. Save tree JSON + sidecar metadata
"""

from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile, status

from config import DOCS_DIR, TREE_DIR, MAX_UPLOAD_BYTES
from core.builder import build_tree, load_document_as_markdown, summarize_tree, embed_tree
from core.embeddings import build_faiss_index, save_faiss_index
from core.tree import save_tree, create_node_map
from models.schemas import IngestResponse
from services.query_cache import invalidate_doc

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


# ── Metadata store helpers ─────────────────────────────────────────────────────

def _meta_path(doc_id: str) -> Path:
    return TREE_DIR / f"{doc_id}.meta.json"


def _write_meta(doc_id: str, filename: str, nodes: int) -> None:
    meta = {"doc_id": doc_id, "filename": filename, "nodes": nodes}
    _meta_path(doc_id).write_text(
        json.dumps(meta, ensure_ascii=False), encoding="utf-8"
    )


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
    """Return comma-separated list of ingested document filenames for query rewriting."""
    metas = read_all_meta()
    return ", ".join(m.get("filename", "") for m in metas if m.get("filename"))


# ── Public service function ────────────────────────────────────────────────────

async def ingest_document(upload: UploadFile, content_type: str | None) -> IngestResponse:
    """
    Full enterprise ingestion pipeline.

    New steps vs original:
      - Step 9:  embed_tree()        — embed every node summary offline
      - Step 10: build FAISS index   — save {doc_id}.faiss + {doc_id}.ids
      - Query cache invalidation for this doc_id on re-ingest
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

    # ── 5. Persist permanently ────────────────────────────────────────────────
    doc_id    = uuid.uuid4().hex
    pdf_path  = DOCS_DIR / f"{doc_id}.pdf"
    tree_path = TREE_DIR  / f"{doc_id}.json"
    faiss_path = TREE_DIR / f"{doc_id}"   # .faiss and .ids added by save_faiss_index

    try:
        async with aiofiles.open(pdf_path, "wb") as fh:
            await fh.write(raw_bytes)

        logger.info("PDF saved: doc_id=%s  original=%s  bytes=%d",
                    doc_id, original_name, len(raw_bytes))

        # ── 6. Convert PDF → Markdown ─────────────────────────────────────────
        markdown = load_document_as_markdown(pdf_path)

        # ── 7. Build tree ─────────────────────────────────────────────────────
        tree = build_tree(markdown)
        logger.info("Tree built: doc_id=%s  nodes=%d", doc_id, tree.node_count())

        # ── 8. Summarise (LLM calls, bottom-up, richer prompts) ───────────────
        logger.info("Summarising tree for doc_id=%s ...", doc_id)
        summarize_tree(tree)

        # ── 9. Embed every node summary (offline sentence-transformer) ────────
        logger.info("Embedding nodes for doc_id=%s ...", doc_id)
        embed_tree(tree)

        # ── 10. Build + save FAISS index ──────────────────────────────────────
        all_nodes  = tree.all_nodes()
        node_ids   = [n.node_id for n in all_nodes if n.embedding]
        embeddings = [n.embedding for n in all_nodes if n.embedding]

        if node_ids:
            faiss_index = build_faiss_index(node_ids, embeddings)
            save_faiss_index(faiss_index, faiss_path)
            logger.info("FAISS index saved: doc_id=%s  vectors=%d", doc_id, len(node_ids))
        else:
            logger.warning("No embeddings to index for doc_id=%s", doc_id)

        # ── 11. Persist tree JSON + metadata ──────────────────────────────────
        save_tree(tree, tree_path)
        _write_meta(doc_id, original_name, tree.node_count())

        # Invalidate any cached queries that touched this doc (re-ingest case).
        invalidate_doc(doc_id)

        logger.info("Ingestion complete: doc_id=%s  original=%s  nodes=%d",
                    doc_id, original_name, tree.node_count())

        return IngestResponse(
            status   = "success",
            doc_id   = doc_id,
            filename = original_name,
            nodes    = tree.node_count(),
            message  = f"'{original_name}' ingested successfully.",
        )

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception("Ingestion failed: doc_id=%s  original=%s", doc_id, original_name)
        pdf_path.unlink(missing_ok=True)
        tree_path.unlink(missing_ok=True)
        faiss_path.with_suffix(".faiss").unlink(missing_ok=True)
        faiss_path.with_suffix(".ids").unlink(missing_ok=True)
        _meta_path(doc_id).unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ingestion failed. Please try again or contact support.",
        ) from exc