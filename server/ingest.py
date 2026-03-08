"""
upload.py — Document ingestion router.

Receives a PDF upload, validates it, stores it permanently for citation,
chunks and embeds the text using a local Ollama model, and persists the
vectors to a local Chroma database.

Security hardening applied:
  - Path-traversal prevention (uuid-prefixed filenames, no raw user input in paths)
  - Magic-byte PDF validation (not just extension checking)
  - File-size cap (configurable via MAX_UPLOAD_BYTES)
  - Content-Type pre-check
  - Sanitised Chroma metadata (no internal paths exposed)
  - Generic error responses to clients; full detail logged server-side only
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, HTTPException, UploadFile, File, status
from langchain_chroma import Chroma
from langchain_community.document_loaders import PyPDFLoader
from langchain_ollama import OllamaEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

# ── Logging ────────────────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

# Anchor all paths to this file's directory so they are CWD-independent.
_BASE_DIR: Path = Path(__file__).resolve().parent

# Permanent document store — files here are NEVER deleted, enabling citation.
DOCS_DIR: Path = _BASE_DIR / "documents"

# ChromaDB persistence directory.
CHROMA_DB_DIR: Path = _BASE_DIR / "chroma_db"

# Maximum accepted upload size (50 MB). Raise or lower as needed.
MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024  # 50 MB

# PDF magic bytes — first 4 bytes of every valid PDF file.
_PDF_MAGIC: bytes = b"%PDF"

# Ensure storage directories exist at import time.
DOCS_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DB_DIR.mkdir(parents=True, exist_ok=True)

# ── Singletons (FIX #8) ────────────────────────────────────────────────────────
# Initialise the embeddings model and Chroma client once at module load,
# not once per request. This avoids repeated cold-start latency and
# eliminates concurrent write conflicts on the Chroma persist directory.

_embeddings = OllamaEmbeddings(model="nomic-embed-text")

_vectorstore = Chroma(
    persist_directory=str(CHROMA_DB_DIR),
    embedding_function=_embeddings,
)

# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_original_name(filename: str | None) -> str:
    """
    Return only the base filename with no directory components.

    Defends against path-traversal payloads such as:
      ``../../etc/passwd``  →  ``passwd``
    """
    if not filename:
        return "upload.pdf"
    return Path(filename).name  # strips all leading path segments


async def _read_with_size_limit(upload: UploadFile, limit: int) -> bytes:
    """
    Stream the upload into memory, raising 413 if it exceeds *limit* bytes.

    Reading in chunks (rather than ``await upload.read()``) means we reject
    oversized files early without buffering the entire payload first.
    """
    chunks: list[bytes] = []
    total = 0
    chunk_size = 64 * 1024  # 64 KB read window

    while True:
        chunk = await upload.read(chunk_size)
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


def _validate_pdf_magic(data: bytes) -> None:
    """
    Reject files that lack the ``%PDF`` magic bytes even if named ``.pdf``.

    This prevents disguised executables or other file types from being
    processed by PyPDFLoader.
    """
    if not data.startswith(_PDF_MAGIC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid PDF (magic bytes mismatch).",
        )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/ingest-test", summary="Ingestion health check")
def ingest_health() -> dict[str, str]:
    """Liveness probe for the ingestion service."""
    return {"status": "active", "message": "Ingestion service is running."}


@router.post(
    "/api/ingest",
    summary="Ingest a PDF into the local knowledge base",
    status_code=status.HTTP_200_OK,
)
async def ingest_document(file: UploadFile = File(...)) -> dict:
    """
    Validate, store, chunk, embed and index a PDF document.

    The original file is **permanently retained** in ``DOCS_DIR`` so that
    downstream citation endpoints can reference it by page number.

    Steps
    -----
    1. Content-Type pre-check (cheap, before reading the body).
    2. Stream the body with an enforced size cap.
    3. Magic-byte validation (actual file format, not just extension).
    4. Persist to ``DOCS_DIR`` under a collision-proof UUID filename.
    5. Load, chunk, normalise metadata, embed, and add to Chroma.
    """

    # ── 1. Content-Type pre-check (FIX #12) ──────────────────────────────────
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF uploads are accepted.",
        )

    # ── 2. Extension check (FIX #2 — first layer) ────────────────────────────
    original_name = _safe_original_name(file.filename)  # FIX #1
    if not original_name.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are supported.",
        )

    # ── 3. Read with size cap (FIX #3) ───────────────────────────────────────
    raw_bytes = await _read_with_size_limit(file, MAX_UPLOAD_BYTES)

    # ── 4. Magic-byte validation (FIX #2 — second layer) ─────────────────────
    _validate_pdf_magic(raw_bytes)

    # ── 5. Persist permanently (FIX #6 + FIX #7) ─────────────────────────────
    # Prefix with a UUID so concurrent uploads of the same filename never
    # collide, and user-supplied names never reach the filesystem directly.
    doc_id = uuid.uuid4().hex
    stored_filename = f"{doc_id}.pdf"
    permanent_path = DOCS_DIR / stored_filename

    try:
        async with aiofiles.open(permanent_path, "wb") as f:  # FIX #9
            await f.write(raw_bytes)

        logger.info(
            "PDF saved permanently",
            extra={"doc_id": doc_id, "original_name": original_name, "bytes": len(raw_bytes)},
        )

        # ── 6. Load & chunk ───────────────────────────────────────────────────
        loader = PyPDFLoader(str(permanent_path))
        documents = loader.load()

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=100,
        )
        chunks = text_splitter.split_documents(documents)

        # ── 7. Normalise metadata (FIX #5) ───────────────────────────────────
        # PyPDFLoader sets `source` to the on-disk path, which would expose
        # the server's directory layout if ever returned to a client.
        # Replace it with the human-readable original filename and the
        # stable doc_id so the citation endpoint can locate the file.
        for chunk in chunks:
            chunk.metadata["source"]        = original_name
            chunk.metadata["doc_id"]        = doc_id
            chunk.metadata["stored_file"]   = stored_filename
            # `page` is already set by PyPDFLoader — preserve it.

        # ── 8. Embed & index via singleton (FIX #8) ──────────────────────────
        _vectorstore.add_documents(chunks)

        logger.info(
            "Document ingested",
            extra={"doc_id": doc_id, "original_name": original_name, "chunks": len(chunks)},
        )

        return {
            "status": "success",
            "message": f"'{original_name}' ingested successfully.",
            "doc_id": doc_id,
            "chunks": len(chunks),
        }

    except HTTPException:
        # Re-raise validation errors as-is; they carry safe client messages.
        raise

    except Exception as exc:
        # FIX #4 — log full detail server-side; return a generic message.
        logger.exception(
            "Ingestion failed",
            extra={"doc_id": doc_id, "original_name": original_name},
        )
        # Remove the partially-written file if ingestion failed mid-way.
        # The file is only removed on unexpected errors — not on success.
        if permanent_path.exists():
            permanent_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ingestion failed. Please try again or contact support.",
        ) from exc