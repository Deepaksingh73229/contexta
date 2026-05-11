"""
core/image_processor.py — Image ingestion for both PDF-embedded and standalone images.

Handles two upload paths through the same describe → TreeNode pipeline:

  PATH A — PDF upload (existing flow):
      ingestion_pipeline.run_pipeline()
          └─ process_pdf_images(pdf_path, doc_id, ...)
                 └─ extract_images_from_pdf()   ← PyMuPDF xref extraction
                 └─ _describe_and_build()        ← vision LLM + TreeNode builder

  PATH B — Standalone image upload (new flow):
      ingestion_pipeline.run_image_pipeline()   ← new thin entry-point
          └─ process_standalone_image_full(img_path, doc_id, ...)
                 └─ process_standalone_image()  ← copy to image store
                 └─ _describe_and_build()        ← same vision LLM + builder

Both paths produce identical TreeNode output that flows through the existing
summarise → embed → FAISS stages unchanged.

Files that need small additions (see INTEGRATION GUIDE at the bottom):
  services/ingestion_service.py  ← accept image MIME types  (+30 lines)
  services/ingestion_pipeline.py ← Stage 3b hook + run_image_pipeline  (+40 lines)
  config.py                      ← IMAGE_* config keys  (+6 lines)

Supported standalone formats: PNG, JPEG, WEBP, GIF, BMP, TIFF
Supported PDF image formats:  any format PyMuPDF can decode
"""

from __future__ import annotations

import base64
import logging
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)

# ── Supported standalone extensions / content-types ───────────────────────────

SUPPORTED_IMAGE_EXTENSIONS: set[str] = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif",
}

SUPPORTED_IMAGE_CONTENT_TYPES: set[str] = {
    "image/png", "image/jpeg", "image/jpg", "image/webp",
    "image/gif", "image/bmp", "image/tiff",
}


# ── Config with safe defaults ──────────────────────────────────────────────────

def _cfg(name: str, default):
    try:
        import config
        return getattr(config, name, default)
    except ImportError:
        return default


def _image_dir() -> Path:
    base = _cfg("BASE_DIR", Path("."))
    d    = _cfg("IMAGE_DIR", base / "image_store")
    Path(d).mkdir(parents=True, exist_ok=True)
    return Path(d)


# ── Intermediate data class ────────────────────────────────────────────────────

@dataclass
class ImageNode:
    """Holds one extracted / copied image before it becomes a TreeNode."""
    image_path:  str          # absolute path to PNG file in image_store
    page_number: int          # 1-indexed PDF page  (always 1 for standalone)
    image_index: int          # position on page    (always 0 for standalone)
    width:       int
    height:      int
    doc_id:      str
    source:      str = "pdf"      # "pdf" | "standalone"
    description: str = ""         # filled by describe_image_node()
    image_type:  str = "image"    # "chart" | "diagram" | "photo" | "table" | "image"


# ── Vision LLM prompt ──────────────────────────────────────────────────────────

_VISION_PROMPT = """\
You are analysing an image for an institutional knowledge retrieval system.
Your description will be the ONLY searchable text for this image — precision matters.

Describe the image using this exact structure:

SCOPE: One sentence — what type of image is this and what does it show overall?
TOPICS: 3-6 bullet points of the key information, data, or concepts shown.
ENTITIES: Comma-separated list of named items visible (organisations, people, systems, product names, codes, labels).
KEYWORDS: Comma-separated technical terms, numbers, axis labels, column headers, or exact phrases a user might search for.
TYPE: One word only — chart / diagram / table / photo / screenshot / map / other

Rules:
- Extract ALL visible text, numbers, labels, legends, and annotations.
- For charts: state the chart type, axis names, and key data points or trends.
- For tables: list column headers and note significant values.
- For diagrams/flowcharts: describe components and relationships between them.
- For photos: state what is shown factually.
- Do NOT say "I can see" or "The image shows" — state facts directly.
- If the image is purely decorative (logo, divider, watermark, icon with no data), reply with exactly: SKIP
"""


# ═══════════════════════════════════════════════════════════════════════════════
#  PATH A — PDF-embedded image extraction
# ═══════════════════════════════════════════════════════════════════════════════

def extract_images_from_pdf(pdf_path: Path, doc_id: str) -> list[ImageNode]:
    """
    Extract all meaningful images from a PDF using PyMuPDF.

    Saves each image as PNG to IMAGE_DIR/{doc_id}/.
    Returns ImageNode list with empty .description (not yet described).
    Skips images smaller than IMAGE_MIN_WIDTH × IMAGE_MIN_HEIGHT.
    Caps at IMAGE_MAX_PER_DOC.
    """
    min_w   = _cfg("IMAGE_MIN_WIDTH",  100)
    min_h   = _cfg("IMAGE_MIN_HEIGHT", 100)
    max_img = _cfg("IMAGE_MAX_PER_DOC", 50)

    out_dir = _image_dir() / doc_id
    out_dir.mkdir(parents=True, exist_ok=True)

    nodes: list[ImageNode] = []

    try:
        import fitz  # PyMuPDF — already a dependency via pymupdf4llm
    except ImportError:
        logger.warning(
            "PyMuPDF (fitz) not available — PDF image extraction skipped. "
            "Install: pip install pymupdf --break-system-packages"
        )
        return []

    try:
        doc = fitz.open(str(pdf_path))
    except Exception as exc:
        logger.error("Cannot open PDF for image extraction: %s", exc)
        return []

    try:
        extracted = 0
        for page_num in range(len(doc)):
            if extracted >= max_img:
                break
            page = doc[page_num]
            for img_idx, img_info in enumerate(page.get_images(full=True)):
                if extracted >= max_img:
                    break
                xref = img_info[0]
                try:
                    base_image  = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    img_ext     = base_image.get("ext", "png").lower()
                    width       = base_image.get("width",  0)
                    height      = base_image.get("height", 0)
                except Exception as exc:
                    logger.debug("Could not extract xref=%d: %s", xref, exc)
                    continue

                if width < min_w or height < min_h:
                    continue  # skip tiny decorative images

                fname      = f"p{page_num + 1:04d}_i{img_idx:03d}.png"
                image_path = out_dir / fname

                try:
                    if img_ext == "png":
                        image_path.write_bytes(image_bytes)
                    else:
                        pixmap = fitz.Pixmap(doc, xref)
                        if pixmap.n > 4:              # CMYK → RGB
                            pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
                        pixmap.save(str(image_path))
                        width, height = pixmap.width, pixmap.height
                except Exception as exc:
                    logger.warning("Could not save image p%d[%d]: %s", page_num + 1, img_idx, exc)
                    continue

                nodes.append(ImageNode(
                    image_path  = str(image_path),
                    page_number = page_num + 1,
                    image_index = img_idx,
                    width       = width,
                    height      = height,
                    doc_id      = doc_id,
                    source      = "pdf",
                ))
                extracted += 1
    finally:
        doc.close()

    logger.info("PDF image extraction: doc_id=%s  found=%d", doc_id, len(nodes))
    return nodes


# ═══════════════════════════════════════════════════════════════════════════════
#  PATH B — Standalone image preparation
# ═══════════════════════════════════════════════════════════════════════════════

def process_standalone_image(image_path: Path, doc_id: str) -> list[ImageNode]:
    """
    Prepare a standalone uploaded image as a single ImageNode.

    Copies the image to IMAGE_DIR/{doc_id}/ for consistent storage.
    Returns a one-element list so it feeds the same _describe_and_build()
    pipeline as PDF-extracted images.
    """
    out_dir = _image_dir() / doc_id
    out_dir.mkdir(parents=True, exist_ok=True)

    suffix = image_path.suffix.lower() or ".png"
    dest   = out_dir / f"standalone{suffix}"

    try:
        shutil.copy2(str(image_path), str(dest))
    except Exception as exc:
        logger.error("Cannot copy standalone image to store: %s", exc)
        return []

    # Read dimensions (Pillow optional — we proceed without if unavailable)
    width, height = 0, 0
    try:
        from PIL import Image as PILImage
        with PILImage.open(dest) as im:
            width, height = im.size
    except Exception:
        logger.debug("Could not read image dimensions — Pillow unavailable or read error.")

    return [ImageNode(
        image_path  = str(dest),
        page_number = 1,
        image_index = 0,
        width       = width,
        height      = height,
        doc_id      = doc_id,
        source      = "standalone",
    )]


# ═══════════════════════════════════════════════════════════════════════════════
#  SHARED — Vision LLM description (identical for both paths)
# ═══════════════════════════════════════════════════════════════════════════════

def describe_image_node(img: ImageNode) -> str:
    """
    Call the configured vision LLM to produce a structured text description.

    Returns the description string, or "" on failure / SKIP signal.
    Mutates img.image_type as a side-effect when the model returns TYPE:.
    """
    vision_model = _cfg("VISION_MODEL", "llava:7b")
    path         = Path(img.image_path)

    if not path.exists():
        logger.warning("Image file missing: %s", path)
        return ""

    try:
        image_b64 = base64.b64encode(path.read_bytes()).decode("utf-8")
    except Exception as exc:
        logger.warning("Cannot read image bytes: %s", exc)
        return ""

    try:
        import mimetypes
        mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
        from core.prompt_registry import get_prompt
        from core.llm import call_vision_llm
        prompt = get_prompt("image_description")   # no variables — pure instruction
        raw    = call_vision_llm(prompt, image_b64=image_b64, mime_type=mime_type)
    except Exception as exc:
        logger.warning(
            "Vision LLM failed (model=%s, source=%s): %s", vision_model, img.source, exc
        )
        return ""

    if raw.strip().upper() == "SKIP":
        logger.debug("Image flagged decorative — skipping. path=%s", img.image_path)
        return ""

    # Extract TYPE hint
    for line in raw.splitlines():
        if line.upper().startswith("TYPE:"):
            detected = line.split(":", 1)[1].strip().lower()
            if detected in ("chart", "diagram", "table", "photo", "screenshot", "map"):
                img.image_type = detected
            break

    return raw


# ═══════════════════════════════════════════════════════════════════════════════
#  SHARED — TreeNode builder (identical output for both paths)
# ═══════════════════════════════════════════════════════════════════════════════

def build_image_tree_nodes(image_nodes: list[ImageNode], start_counter: int) -> list:
    """
    Convert described ImageNode objects into TreeNode objects.

    Title format:
      PDF-embedded  → "Image — Page 3 (chart)"
      Standalone    → "Image — standalone (photo)"

    The [IMAGE_PATH:...] sentinel in .content lets the frontend extract the
    file path from SourceCitation content for inline image rendering.

    Nodes with empty .description are silently dropped.
    """
    from core.tree import TreeNode

    result:  list[TreeNode] = []
    counter: int            = start_counter

    for img in image_nodes:
        if not img.description:
            continue

        title = (
            f"Image — Page {img.page_number} ({img.image_type})"
            if img.source == "pdf"
            else f"Image — standalone ({img.image_type})"
        )

        # Sentinel prefix so frontend/query layer can detect and surface the image path
        content = (
            f"[IMAGE_PATH:{img.image_path}]\n"
            f"Source: {img.source}\n"
            f"Page: {img.page_number}\n"
            f"Type: {img.image_type}\n"
            f"Size: {img.width}×{img.height}px\n\n"
            f"{img.description}"
        )

        node = TreeNode(
            title   = title,
            node_id = f"{counter:04d}",
            content = content,
            # description IS the summary — the summarise stage checks `if n.summary`
            # and skips nodes that already have one, so no extra LLM call is made.
            summary = img.description,
        )
        result.append(node)
        counter += 1

    logger.info(
        "Built %d image TreeNodes from %d candidates (start=%d).",
        len(result), len(image_nodes), start_counter,
    )
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  SHARED — parallel describe + build
# ═══════════════════════════════════════════════════════════════════════════════

def _describe_and_build(
    image_nodes:   list[ImageNode],
    start_counter: int,
    cancelled:     threading.Event,
    progress_cb:   Callable | None,
    workers:       int,
) -> list:
    """Describe all ImageNodes in parallel, then build TreeNodes. Used by both paths."""
    total      = len(image_nodes)
    done_lock  = threading.Lock()
    done_count = [0]

    def _describe_one(img: ImageNode) -> ImageNode:
        if cancelled.is_set():
            return img
        
        img.description = describe_image_node(img)

        with done_lock:
            done_count[0] += 1
            n = done_count[0]

        if progress_cb:
            progress_cb(
                pct          = n / total * 100,
                stage        = "describing_images",
                current_node = f"{img.source} image p{img.page_number}[{img.image_index}]",
                nodes_done   = n,
                total_nodes  = total,
            )
        return img

    # Cap at 2 — vision models are typically GPU-serial; extra threads just queue
    actual_workers = min(workers, total, 2)

    with ThreadPoolExecutor(max_workers=actual_workers, thread_name_prefix="img-describe") as ex:
        futures   = {ex.submit(_describe_one, img): img for img in image_nodes}
        described: list[ImageNode] = []
        for future in as_completed(futures):
            if cancelled.is_set():
                ex.shutdown(wait=False, cancel_futures=True)
                break
            try:
                described.append(future.result())
            except Exception as exc:
                logger.warning("Image describe task raised: %s", exc)

    return build_image_tree_nodes(described, start_counter)


# ═══════════════════════════════════════════════════════════════════════════════
#  PATH A public API  —  called from ingestion_pipeline.run_pipeline()
# ═══════════════════════════════════════════════════════════════════════════════

def process_pdf_images(
    pdf_path:      Path,
    doc_id:        str,
    start_counter: int,
    cancelled:     threading.Event,
    progress_cb:   Callable | None = None,
) -> list:
    """
    PDF image flow: extract → describe → build TreeNodes.
    Called after Stage 3 (build_tree) in run_pipeline().
    Returns list[TreeNode] to extend tree.nodes with.
    """
    if not _cfg("IMAGE_INGESTION_ENABLED", True):
        return []

    if progress_cb:
        progress_cb(pct=0.0, stage="extracting_images",
                    current_node="Scanning PDF for images")

    image_nodes = extract_images_from_pdf(pdf_path, doc_id)
    if not image_nodes:
        return []

    return _describe_and_build(
        image_nodes   = image_nodes,
        start_counter = start_counter,
        cancelled     = cancelled,
        progress_cb   = progress_cb,
        workers       = 2,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  PATH B public API  —  called from ingestion_pipeline.run_image_pipeline()
# ═══════════════════════════════════════════════════════════════════════════════

def process_standalone_image_full(
    image_path:  Path,
    doc_id:      str,
    cancelled:   threading.Event,
    progress_cb: Callable | None = None,
) -> list:
    """
    Standalone image flow: copy → describe → build TreeNode.
    Called from run_image_pipeline() — the new pipeline entry-point for images.
    Returns a list with 0 or 1 TreeNode.
    """
    if not _cfg("IMAGE_INGESTION_ENABLED", True):
        return []

    if progress_cb:
        progress_cb(pct=10.0, stage="processing_image",
                    current_node=f"Processing {image_path.name}")

    image_nodes = process_standalone_image(image_path, doc_id)

    if not image_nodes:
        return []

    return _describe_and_build(
        image_nodes   = image_nodes,
        start_counter = 1,    # root = 0000, first (only) image node = 0001
        cancelled     = cancelled,
        progress_cb   = progress_cb,
        workers       = 1,    # single image — no parallelism needed
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  INTEGRATION GUIDE
# ═══════════════════════════════════════════════════════════════════════════════
#
# 1. DROP this file into:  server/core/image_processor.py
#
# ─────────────────────────────────────────────────────────────────────────────
# 2. config.py — append these 6 lines:
# ─────────────────────────────────────────────────────────────────────────────
#
#   IMAGE_INGESTION_ENABLED: bool = get_bool("IMAGE_INGESTION_ENABLED", True)
#   VISION_MODEL:            str  = os.getenv("VISION_MODEL", "llava:7b")
#   IMAGE_MIN_WIDTH:         int  = int(os.getenv("IMAGE_MIN_WIDTH",  "100"))
#   IMAGE_MIN_HEIGHT:        int  = int(os.getenv("IMAGE_MIN_HEIGHT", "100"))
#   IMAGE_MAX_PER_DOC:       int  = int(os.getenv("IMAGE_MAX_PER_DOC", "50"))
#   IMAGE_DIR:               Path = BASE_DIR / os.getenv("IMAGE_DIR", "image_store")
#
# ─────────────────────────────────────────────────────────────────────────────
# 3. services/ingestion_pipeline.py  — two additions:
# ─────────────────────────────────────────────────────────────────────────────
#
# ADDITION A — Stage 3b block, insert immediately after the existing
#              "if tree is None: raise RuntimeError(...)" line:
#
#     # ── Stage 3b: Extract and describe PDF images (non-fatal) ─────────────
#     _check_cancel()
#     if last_stage in ("tree_built",):
#         try:
#             from config import IMAGE_INGESTION_ENABLED
#             if IMAGE_INGESTION_ENABLED:
#                 from core.image_processor import process_pdf_images
#                 _cb(20.5, "extracting_images", current_node="Scanning PDF for images")
#                 image_nodes = process_pdf_images(
#                     pdf_path      = pdf_path,
#                     doc_id        = doc_id,
#                     start_counter = tree.node_count(),
#                     cancelled     = cancelled,
#                     progress_cb   = _cb,
#                 )
#                 if image_nodes:
#                     tree.nodes.extend(image_nodes)
#                     total_nodes = tree.node_count()
#                     logger.info("Added %d image nodes. Total: %d", len(image_nodes), total_nodes)
#                     _write_checkpoint(doc_id, "tree_built", tree, 0, total_nodes)
#         except Exception as exc:
#             logger.warning("Image processing failed (non-fatal): %s", exc)
#
# ADDITION B — new function run_image_pipeline(), add at the END of the file:
#
#   def run_image_pipeline(
#       task_id:      str,
#       doc_id:       str,
#       filename:     str,
#       image_path:   Path,
#       progress_cb:  Callable,
#       cancelled:    threading.Event,
#   ) -> None:
#       """Standalone image ingestion pipeline (single-image equivalent of run_pipeline)."""
#       tree_path  = TREE_DIR / f"{doc_id}.json"
#       faiss_path = TREE_DIR / doc_id
#
#       def _cb(pct, stage, **kw): progress_cb(pct=pct, stage=stage, **kw)
#       def _check_cancel():
#           if cancelled.is_set(): raise InterruptedError("Task cancelled by user.")
#
#       _check_cancel()
#       task_store.mark_stage(task_id, "uploaded", pct=5.0)
#       _cb(5.0, "uploaded")
#
#       # Build a minimal root tree then add the image node
#       from core.tree import TreeNode
#       tree = TreeNode(title=filename, node_id="0000", content="")
#
#       _check_cancel()
#       _cb(20.0, "processing_image")
#       from core.image_processor import process_standalone_image_full
#       image_nodes = process_standalone_image_full(image_path, doc_id, cancelled, _cb)
#       tree.nodes.extend(image_nodes)
#
#       if not tree.nodes:
#           raise RuntimeError("Vision LLM produced no description for the image.")
#
#       # Image nodes already have .summary — embed directly, skip summarise
#       _check_cancel()
#       _cb(72.0, "embedding")
#       all_nodes = tree.all_nodes()
#       to_embed  = [n for n in all_nodes if n.summary and not n.embedding]
#       if to_embed:
#           from core.embeddings import embed_batch
#           embeddings = embed_batch([n.summary for n in to_embed])
#           for n, vec in zip(to_embed, embeddings): n.embedding = vec
#
#       _check_cancel()
#       _cb(85.0, "indexing")
#       node_ids  = [n.node_id for n in all_nodes if n.embedding]
#       node_embs = [n.embedding for n in all_nodes if n.embedding]
#       if node_ids:
#           from core.embeddings import build_faiss_index, save_faiss_index
#           save_faiss_index(build_faiss_index(node_ids, node_embs), faiss_path)
#
#       _check_cancel()
#       _cb(95.0, "saving")
#       save_tree(tree, tree_path)
#       import json
#       (TREE_DIR / f"{doc_id}.meta.json").write_text(
#           json.dumps({"doc_id": doc_id, "filename": filename, "nodes": tree.node_count()}),
#           encoding="utf-8",
#       )
#       from services.query_cache import invalidate_doc
#       invalidate_doc(doc_id)
#       task_store.mark_done(task_id, tree.node_count())
#       _cb(100.0, "done", nodes=tree.node_count())
#
# ─────────────────────────────────────────────────────────────────────────────
# 4. services/ingestion_service.py  — replace enqueue_ingest() content-type
#    and filename checks with the version below (or call enqueue_image_ingest
#    as a separate function — see patch file):
# ─────────────────────────────────────────────────────────────────────────────
#
#   REPLACE the two guard blocks at the top of enqueue_ingest():
#
#     # OLD:
#     if content_type not in ("application/pdf", "application/octet-stream"):
#         raise HTTPException(status_code=415, detail="Only PDF uploads are accepted.")
#     original_name = _safe_filename(upload.filename)
#     if not original_name.lower().endswith(".pdf"):
#         raise HTTPException(status_code=400, detail="Only PDF files are supported.")
#
#     # NEW:
#     from core.image_processor import SUPPORTED_IMAGE_CONTENT_TYPES, SUPPORTED_IMAGE_EXTENSIONS
#     _ALLOWED_CT = {"application/pdf", "application/octet-stream"} | SUPPORTED_IMAGE_CONTENT_TYPES
#     if content_type not in _ALLOWED_CT:
#         raise HTTPException(status_code=415, detail="Only PDF and image uploads are accepted.")
#     original_name = _safe_filename(upload.filename)
#     suffix = Path(original_name).suffix.lower()
#     is_image = suffix in SUPPORTED_IMAGE_EXTENSIONS
#     if suffix != ".pdf" and not is_image:
#         raise HTTPException(status_code=400, detail="Only PDF and image files are supported.")
#
#   AND replace the submit call near the bottom:
#
#     # OLD:
#     task_manager.submit(rec.task_id, doc_id, original_name)
#
#     # NEW:
#     if is_image:
#         task_manager.submit_image(rec.task_id, doc_id, original_name,
#                                   DOCS_DIR / f"{doc_id}{suffix}")
#     else:
#         task_manager.submit(rec.task_id, doc_id, original_name)
#
#   AND in task_manager.py add submit_image():
#
#     def submit_image(task_id: str, doc_id: str, filename: str, image_path: Path) -> None:
#         with _lock:
#             flag = threading.Event()
#             _cancel_flags[task_id] = flag
#         _get_executor().submit(_run_image_task, task_id, doc_id, filename, image_path)
#
#     def _run_image_task(task_id, doc_id, filename, image_path):
#         task_store.mark_running(task_id)
#         cancel_flag = _cancel_flags.get(task_id, threading.Event())
#         progress_cb = _make_progress_cb(task_id)
#         try:
#             from services.ingestion_pipeline import run_image_pipeline
#             run_image_pipeline(task_id, doc_id, filename, image_path, progress_cb, cancel_flag)
#         except InterruptedError:
#             task_store.mark_cancelled(task_id)
#         except Exception as exc:
#             task_store.mark_failed(task_id, str(exc))
#         finally:
#             with _lock: _cancel_flags.pop(task_id, None)
#
# ─────────────────────────────────────────────────────────────────────────────
# 5. Pull a vision model before re-ingesting:
#    ollama pull llava:7b        (~4 GB, good general purpose)
#    ollama pull minicpm-v       (~3 GB, strong on documents/tables)
# ─────────────────────────────────────────────────────────────────────────────