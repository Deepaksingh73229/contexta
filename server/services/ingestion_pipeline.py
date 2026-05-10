"""
services/ingestion_pipeline.py — Resumable, parallel ingestion pipeline.

This module owns the actual work of converting a PDF into a fully indexed
document.  It replaces the synchronous ingest_document() call in the old
ingestion_service with a pipeline that:

  1.  Reports fine-grained progress via a callback (pct 0–100, current stage,
      ETA in seconds) so the frontend can show a live progress bar.

  2.  Checkpoints after every stage to a JSON sidecar file in TREE_DIR.
      On resume, already-completed stages are skipped entirely.

  3.  Parallelises the summarise step (the heaviest bottleneck) using a
      ThreadPoolExecutor.  Each node's LLM summary call runs in a worker
      thread.  Degree of parallelism is controlled by config.SUMMARISE_WORKERS.

  4.  Supports cooperative cancellation: the pipeline checks a `cancelled`
      flag between every node and raises CancelledError cleanly if set.

Checkpoint sidecar format (TREE_DIR/{doc_id}.checkpoint.json)
-------------------------------------------------------------
{
  "stage":        "summarised",
  "nodes_done":   12,
  "total_nodes":  47,
  "tree_partial": { ... }   <- full tree dict; re-loaded on resume
}

Public surface
--------------
  run_pipeline(task_id, doc_id, filename, progress_cb, cancelled_flag)
      → None   (raises on unrecoverable failure)
"""

from __future__ import annotations

import json
import logging
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Callable

from config import (
    BASE_DIR,
    DOCS_DIR,
    TREE_DIR,
    MAX_SUMMARY_CHARS,
    SUMMARISE_WORKERS,
)

from core.prompt_registry import get_prompt

from core.builder import (
    build_tree,
    load_document_as_markdown,
    _has_meaningful_content,
    # _SUMMARY_PROMPT,
    # _SUMMARY_PROMPT_FALLBACK,
)

from core.embeddings import build_faiss_index, save_faiss_index, embed_batch
from core.llm import call_llm
from core.tree import TreeNode, save_tree, load_tree, _dict_to_node
from services import task_store
from services.query_cache import invalidate_doc

logger = logging.getLogger(__name__)

# ── Checkpoint helpers ─────────────────────────────────────────────────────────

def _checkpoint_path(doc_id: str) -> Path:
    return TREE_DIR / f"{doc_id}.checkpoint.json"


def _write_checkpoint(doc_id: str, stage: str, tree: TreeNode, nodes_done: int, total_nodes: int) -> None:
    """Persist current pipeline state to disk."""
    cp = {
        "stage":       stage,
        "nodes_done":  nodes_done,
        "total_nodes": total_nodes,
        "tree_partial": tree.to_dict(include_content=True, include_embedding=True),
    }

    _checkpoint_path(doc_id).write_text(
        json.dumps(cp, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    logger.debug("Checkpoint written: doc_id=%s  stage=%s  nodes=%d/%d",
                 doc_id, stage, nodes_done, total_nodes)


def _load_checkpoint(doc_id: str) -> dict | None:
    """Load the checkpoint sidecar if it exists."""
    path = _checkpoint_path(doc_id)

    if not path.exists():
        return None
    
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Could not load checkpoint for doc_id=%s: %s", doc_id, exc)
        return None


def _delete_checkpoint(doc_id: str) -> None:
    _checkpoint_path(doc_id).unlink(missing_ok=True)


# ── ETA estimator ──────────────────────────────────────────────────────────────

class _EtaEstimator:
    """
    Rolling ETA estimator for the summarise stage.

    Tracks the wall-clock time per node and predicts remaining time.
    """

    def __init__(self, total: int):
        self.total     = total
        self.done      = 0
        self._times:   list[float] = []
        self._t_start: float | None = None

    def start_node(self) -> None:
        self._t_start = time.time()

    def end_node(self) -> None:
        if self._t_start is not None:
            elapsed = time.time() - self._t_start
            self._times.append(elapsed)
            self.done += 1
            self._t_start = None

    @property
    def avg_seconds_per_node(self) -> float:
        if not self._times:
            return 15.0   # fallback before we have any data
        
        # Exponential moving average — recent nodes weighted more heavily.
        alpha   = 0.3
        result  = self._times[0]

        for t in self._times[1:]:
            result = alpha * t + (1 - alpha) * result

        return result

    @property
    def eta_seconds(self) -> float:
        remaining = self.total - self.done
        return remaining * self.avg_seconds_per_node


# ── Parallel summarise ─────────────────────────────────────────────────────────

def _summarise_node(node: TreeNode) -> str | None:
    """
    Summarise a single node.  Returns the summary string or None if skipped.
    Thread-safe: each call is independent.
    """
    has_content        = _has_meaningful_content(node.content)
    has_child_summaries = any(child.summary for child in node.nodes)

    if not has_content and not has_child_summaries:
        return None

    if has_child_summaries:
        children_text = "\n".join(
            f"- {child.title}: {child.summary}"
            for child in node.nodes
            if child.summary
        )

        text = (
            f"{node.content}\n\nChild sections:\n{children_text}"
            if has_content
            else children_text
        )
    else:
        text = node.content

    try:
        # prompt = _SUMMARY_PROMPT.format(title=node.title, content=text[:MAX_SUMMARY_CHARS])
        prompt = get_prompt("node_summary", title=node.title, content=text[:MAX_SUMMARY_CHARS])
        return call_llm(prompt)
    except Exception:
        try:
            # prompt = _SUMMARY_PROMPT_FALLBACK.format(title=node.title, content=text[:MAX_SUMMARY_CHARS])
            prompt = get_prompt("node_summary_fallback", title=node.title, content=text[:MAX_SUMMARY_CHARS])
            return call_llm(prompt)
        except Exception as exc:
            logger.warning("Summary failed for node %s: %s", node.node_id, exc)
            return f"Summary unavailable for section: {node.title}"


def _parallel_summarise(
    all_nodes:    list[TreeNode],
    task_id:      str,
    doc_id:       str,
    tree:         TreeNode,
    progress_cb:  Callable,
    cancelled:    threading.Event,
    nodes_already_done: int = 0,
) -> int:
    """
    Summarise all nodes using a thread pool.

    Bottom-up ordering is critical: children must be summarised before
    their parents (parent summaries include child summaries).

    Strategy:
    - Sort nodes by depth descending (leaves first, root last).
    - Submit leaf-level nodes first, wait for them, then parents.
    - Actually, since summaries are read from node.summary which is
      mutated in-place, we process depth levels sequentially but
      within each level we parallelise.

    Returns
    -------
    Number of nodes successfully summarised.
    """
    # Build depth map.
    depth_map: dict[str, int] = {}
    _assign_depths_map(tree, 0, depth_map)

    # Group nodes by depth level, deepest first.
    max_depth = max(depth_map.values(), default=0)
    levels: dict[int, list[TreeNode]] = {d: [] for d in range(max_depth + 1)}
    for node in all_nodes:
        depth = depth_map.get(node.node_id, 0)
        levels[depth].append(node)

    eta = _EtaEstimator(total=len(all_nodes) - nodes_already_done)
    nodes_done = nodes_already_done
    checkpoint_interval = max(1, len(all_nodes) // 20)  # checkpoint every ~5%

    for depth in range(max_depth, -1, -1):
        level_nodes = [n for n in levels[depth] if not n.summary]
        if not level_nodes:
            continue

        with ThreadPoolExecutor(max_workers=SUMMARISE_WORKERS) as executor:
            future_to_node = {
                executor.submit(_summarise_node, node): node
                for node in level_nodes
            }

            for future in as_completed(future_to_node):
                if cancelled.is_set():
                    # Cancel remaining futures gracefully.
                    executor.shutdown(wait=False, cancel_futures=True)
                    raise InterruptedError("Task cancelled by user.")

                node    = future_to_node[future]
                summary = future.result()
                if summary:
                    node.summary = summary

                eta.end_node()
                nodes_done += 1

                # Calculate precise percentage: summarise stage spans 20%→70%.
                summarise_pct = 20.0 + (nodes_done / len(all_nodes)) * 50.0

                task_store.mark_stage(
                    task_id,
                    stage        = "summarising",
                    pct          = summarise_pct,
                    nodes_done   = nodes_done,
                    total_nodes  = len(all_nodes),
                    current_node = node.title[:60],
                    eta_seconds  = eta.eta_seconds,
                )

                progress_cb(
                    pct          = summarise_pct,
                    stage        = "summarising",
                    current_node = node.title,
                    nodes_done   = nodes_done,
                    total_nodes  = len(all_nodes),
                    eta_seconds  = eta.eta_seconds,
                )

                # Periodic checkpoint.
                if nodes_done % checkpoint_interval == 0:
                    _write_checkpoint(doc_id, "summarising", tree, nodes_done, len(all_nodes))

                eta.start_node()

    return nodes_done


def _assign_depths_map(node: TreeNode, depth: int, out: dict[str, int]) -> None:
    out[node.node_id] = depth
    for child in node.nodes:
        _assign_depths_map(child, depth + 1, out)


# ── Main pipeline ──────────────────────────────────────────────────────────────

def run_pipeline(
    task_id:      str,
    doc_id:       str,
    filename:     str,
    progress_cb:  Callable,
    cancelled:    threading.Event,
) -> None:
    """
    Full resumable ingestion pipeline for one document.

    Parameters
    ----------
    task_id     : TaskRecord identifier (for task_store updates).
    doc_id      : UUID hex identifying the document.
    filename    : Original human-readable filename.
    progress_cb : Callable(pct, stage, **kwargs) called on every progress event.
    cancelled   : threading.Event — set externally to request cancellation.

    Raises
    ------
    InterruptedError  : Task was cancelled.
    Exception         : Any unrecoverable pipeline failure.
    """
    pdf_path   = DOCS_DIR / f"{doc_id}.pdf"
    tree_path  = TREE_DIR / f"{doc_id}.json"
    faiss_path = TREE_DIR / doc_id

    # ── Load checkpoint (resume support) ──────────────────────────────────────
    cp             = _load_checkpoint(doc_id)
    last_stage     = cp["stage"]       if cp else "queued"
    nodes_done     = cp["nodes_done"]  if cp else 0
    total_nodes    = cp["total_nodes"] if cp else 0
    tree: TreeNode | None = None

    if cp and "tree_partial" in cp:
        try:
            tree = _dict_to_node(cp["tree_partial"])
            logger.info("Resuming from checkpoint: stage=%s  nodes=%d/%d",
                        last_stage, nodes_done, total_nodes)
        except Exception as exc:
            logger.warning("Checkpoint tree corrupt, restarting: %s", exc)
            cp = None
            last_stage = "queued"

    def _cb(pct: float, stage: str, **kw) -> None:
        progress_cb(pct=pct, stage=stage, **kw)

    def _check_cancel() -> None:
        if cancelled.is_set():
            raise InterruptedError("Task cancelled by user.")

    # ── Stage 1: Validate PDF exists ──────────────────────────────────────────
    _check_cancel()
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found on disk: {pdf_path}")

    if last_stage in ("queued",):
        task_store.mark_stage(task_id, "uploaded", pct=5.0)
        _cb(5.0, "uploaded")
        last_stage = "uploaded"

    # ── Stage 2: PDF → Markdown ───────────────────────────────────────────────
    _check_cancel()
    markdown: str = ""

    if last_stage in ("uploaded",):
        _cb(8.0, "converting_pdf")
        markdown = load_document_as_markdown(pdf_path)
        task_store.mark_stage(task_id, "markdown", pct=10.0)
        _cb(10.0, "markdown")
        last_stage = "markdown"
        # Checkpoint the markdown content? It's large — we skip and just re-run.
    elif tree is not None:
        # Already have tree from checkpoint — markdown not needed again.
        pass
    else:
        markdown = load_document_as_markdown(pdf_path)


    # ── Stage 3: Build tree ───────────────────────────────────────────────────
    _check_cancel()

    if last_stage in ("markdown",):
        _cb(15.0, "building_tree")
        tree = build_tree(markdown)
        total_nodes = tree.node_count()
        task_store.mark_stage(task_id, "tree_built", pct=20.0, total_nodes=total_nodes)
        _cb(20.0, "tree_built", total_nodes=total_nodes)
        _write_checkpoint(doc_id, "tree_built", tree, 0, total_nodes)
        last_stage = "tree_built"

    if tree is None:
        raise RuntimeError("No tree available after tree_built stage — this is a bug.")
    

    # ── IMAGE Stage 3b: Extract and describe PDF-embedded images (non-fatal) ──
    _check_cancel()

    if last_stage in ("tree_built",):
        try:
            from config import IMAGE_INGESTION_ENABLED
            if IMAGE_INGESTION_ENABLED:
                from core.image_processor import process_pdf_images
                _cb(20.5, "extracting_images", current_node="Scanning PDF for images")
                image_nodes = process_pdf_images(
                    pdf_path      = pdf_path,
                    doc_id        = doc_id,
                    start_counter = tree.node_count(),
                    cancelled     = cancelled,
                    progress_cb   = _cb,
                )
                if image_nodes:
                    tree.nodes.extend(image_nodes)
                    total_nodes = tree.node_count()
                    logger.info(
                        "Added %d image nodes. Total nodes now: %d",
                        len(image_nodes), total_nodes,
                    )
                    _write_checkpoint(doc_id, "tree_built", tree, 0, total_nodes)
        except Exception as exc:
            # Non-fatal: image failure must NEVER break the text pipeline
            logger.warning("Image processing failed (text pipeline continues): %s", exc)


    # ── Stage 4: Summarise nodes (parallelised, per-node progress) ────────────
    _check_cancel()

    if last_stage in ("tree_built", "summarising"):
        all_nodes = tree.all_nodes()
        total_nodes = len(all_nodes)

        # Skip nodes that already have summaries (from checkpoint).
        already_done = sum(1 for n in all_nodes if n.summary)
        logger.info("Summarise: %d nodes total, %d already done", total_nodes, already_done)

        nodes_done = _parallel_summarise(
            all_nodes          = all_nodes,
            task_id            = task_id,
            doc_id             = doc_id,
            tree               = tree,
            progress_cb        = _cb,
            cancelled          = cancelled,
            nodes_already_done = already_done,
        )

        _write_checkpoint(doc_id, "summarised", tree, nodes_done, total_nodes)
        task_store.mark_stage(task_id, "summarised", pct=70.0,
                              nodes_done=nodes_done, total_nodes=total_nodes)
        _cb(70.0, "summarised", nodes_done=nodes_done, total_nodes=total_nodes)
        last_stage = "summarised"

    # ── Stage 5: Embed nodes ──────────────────────────────────────────────────
    _check_cancel()

    if last_stage in ("summarised",):
        _cb(72.0, "embedding")
        all_nodes = tree.all_nodes()
        to_embed  = [n for n in all_nodes if n.summary and not n.embedding]

        if to_embed:
            texts      = [n.summary for n in to_embed]
            embeddings = embed_batch(texts)
            for n, vec in zip(to_embed, embeddings):
                n.embedding = vec

        _write_checkpoint(doc_id, "embedded", tree, len(all_nodes), len(all_nodes))
        task_store.mark_stage(task_id, "embedded", pct=80.0)
        _cb(80.0, "embedded")
        last_stage = "embedded"

    # ── Stage 6: Build FAISS index ────────────────────────────────────────────
    _check_cancel()

    if last_stage in ("embedded",):
        _cb(85.0, "indexing")
        all_nodes  = tree.all_nodes()
        node_ids   = [n.node_id for n in all_nodes if n.embedding]
        node_embs  = [n.embedding for n in all_nodes if n.embedding]

        if node_ids:
            faiss_index = build_faiss_index(node_ids, node_embs)
            save_faiss_index(faiss_index, faiss_path)

        task_store.mark_stage(task_id, "indexed", pct=90.0)
        _cb(90.0, "indexed")
        last_stage = "indexed"

    # ── Stage 7: Save tree JSON + metadata ────────────────────────────────────
    _check_cancel()

    if last_stage in ("indexed",):
        _cb(95.0, "saving")
        save_tree(tree, tree_path)

        # Write metadata sidecar.
        meta = {
            "doc_id":   doc_id,
            "filename": filename,
            "nodes":    tree.node_count(),
        }
        (TREE_DIR / f"{doc_id}.meta.json").write_text(
            json.dumps(meta, ensure_ascii=False), encoding="utf-8"
        )

        # Invalidate cached queries for this doc (re-ingest case).
        invalidate_doc(doc_id)

        # Invalidate in-memory tree/FAISS caches so subsequent queries see fresh data.
        try:
            from services.query_service import invalidate_doc_caches
            invalidate_doc_caches(doc_id)
        except Exception as exc:
            logger.warning("Could not invalidate query-service caches for doc_id=%s: %s", doc_id, exc)

        # Clean up checkpoint — no longer needed.
        _delete_checkpoint(doc_id)

        task_store.mark_done(task_id, tree.node_count())
        _cb(100.0, "done", nodes=tree.node_count())

    logger.info("Pipeline complete: doc_id=%s  nodes=%d", doc_id, tree.node_count())


# ═══════════════════════════════════════════════════════════════════════════════
#  PATH B — Standalone image pipeline  (IMAGE new addition)
# ═══════════════════════════════════════════════════════════════════════════════
 
def run_image_pipeline(
    task_id:     str,
    doc_id:      str,
    filename:    str,
    image_path:  Path,
    progress_cb: Callable,
    cancelled:   threading.Event,
) -> None:
    """
    Ingestion pipeline for a standalone uploaded image.
 
    Skips markdown conversion and tree-building — creates a minimal
    single-node tree, describes the image via vision LLM, then flows
    through the standard embed → FAISS → save stages.
 
    Stages reported to the frontend:
      uploaded (5%) → processing_image (20%) → embedding (72%)
      → indexing (85%) → saving (95%) → done (100%)
    """
    tree_path  = TREE_DIR / f"{doc_id}.json"
    faiss_path = TREE_DIR / doc_id
 
    def _cb(pct, stage, **kw): progress_cb(pct=pct, stage=stage, **kw)
    def _check_cancel():
        if cancelled.is_set(): raise InterruptedError("Task cancelled by user.")
 
    # Stage 1: Mark uploaded
    _check_cancel()
    task_store.mark_stage(task_id, "uploaded", pct=5.0)
    _cb(5.0, "uploaded")
 
    # Stage 2: Build minimal root + describe image
    _check_cancel()
    _cb(20.0, "processing_image", current_node=f"Describing {filename}")
 
    tree = TreeNode(title=filename, node_id="0000", content="")
 
    try:
        from core.image_processor import process_standalone_image_full
        
        image_nodes = process_standalone_image_full(
            image_path  = image_path,
            doc_id      = doc_id,
            cancelled   = cancelled,
            progress_cb = _cb,
        )
    except Exception as exc:
        raise RuntimeError(f"Image description failed: {exc}") from exc
 
    if not image_nodes:
        raise RuntimeError(
            "Vision LLM produced no usable description for the uploaded image. "
            "Ensure your vision model is running: ollama pull llava:7b"
        )
 
    tree.nodes.extend(image_nodes)
    logger.info("Standalone image: built %d node(s) for doc_id=%s", len(image_nodes), doc_id)
 
    task_store.mark_stage(task_id, "tree_built", pct=70.0, total_nodes=tree.node_count())
    _cb(70.0, "tree_built", total_nodes=tree.node_count())
 
    # Stage 3: Embed  (image nodes already have .summary from vision LLM)
    _check_cancel()
    _cb(72.0, "embedding")
    all_nodes = tree.all_nodes()
    to_embed  = [n for n in all_nodes if n.summary and not n.embedding]
    if to_embed:
        embeddings = embed_batch([n.summary for n in to_embed])
        for n, vec in zip(to_embed, embeddings):
            n.embedding = vec
    task_store.mark_stage(task_id, "embedded", pct=80.0)
    _cb(80.0, "embedded")
 
    # Stage 4: Build FAISS index
    _check_cancel()
    _cb(85.0, "indexing")
    node_ids  = [n.node_id for n in all_nodes if n.embedding]
    node_embs = [n.embedding for n in all_nodes if n.embedding]
    if node_ids:
        save_faiss_index(build_faiss_index(node_ids, node_embs), faiss_path)
    task_store.mark_stage(task_id, "indexed", pct=90.0)
    _cb(90.0, "indexed")
 
    # Stage 5: Save
    _check_cancel()
    _cb(95.0, "saving")
    save_tree(tree, tree_path)
    meta = {"doc_id": doc_id, "filename": filename, "nodes": tree.node_count()}
    (TREE_DIR / f"{doc_id}.meta.json").write_text(
        json.dumps(meta, ensure_ascii=False), encoding="utf-8"
    )
    invalidate_doc(doc_id)
    try:
        from services.query_service import invalidate_doc_caches
        invalidate_doc_caches(doc_id)
    except Exception as exc:
        logger.warning("Could not invalidate query-service caches: %s", exc)
 
    task_store.mark_done(task_id, tree.node_count())
    _cb(100.0, "done", nodes=tree.node_count())
 
    logger.info(
        "Image pipeline complete: doc_id=%s  filename=%s  nodes=%d",
        doc_id, filename, tree.node_count(),
    )