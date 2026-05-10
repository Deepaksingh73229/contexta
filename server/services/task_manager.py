"""
services/task_manager.py — Background ingestion worker pool.

Responsibilities
----------------
1. Maintains a fixed-size pool of worker threads for running ingestion pipelines.
2. On application startup, auto-resumes any "interrupted" tasks that were running
   when the previous process died.
3. Accepts new tasks from the ingest endpoint and queues them for background execution.
4. Tracks per-task cancellation via threading.Event objects.
5. Exposes get_status() so the tasks router can serve live progress.

Concurrency model
-----------------
FastAPI is async (asyncio event loop).  The ingestion pipeline is CPU/IO-bound
(LLM calls, disk writes) and MUST NOT block the event loop.  We use:

  asyncio.get_event_loop().run_in_executor(executor, fn)

with a ThreadPoolExecutor sized to MAX_PARALLEL_INGESTIONS.  Each task runs
in its own thread.  Progress callbacks post updates back via a thread-safe
queue that asyncio can read.

Public surface
--------------
  startup_resume()               → None   (called from FastAPI lifespan)
  submit(task_id, doc_id, filename) → None
  cancel(task_id)                → bool
  get_status(task_id)            → TaskRecord | None
  get_all_active()               → list[TaskRecord]
  shutdown()                     → None   (called on app shutdown)
"""

from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from config import MAX_PARALLEL_INGESTIONS
from services import task_store
from services.task_store import TaskRecord
from services.ingestion_pipeline import run_pipeline

logger = logging.getLogger(__name__)

# ── Worker pool ────────────────────────────────────────────────────────────────
_executor: ThreadPoolExecutor | None = None
_cancel_flags: dict[str, threading.Event] = {}  # task_id → cancel event
_lock = threading.Lock()


def _get_executor() -> ThreadPoolExecutor:
    global _executor

    if _executor is None:
        _executor = ThreadPoolExecutor(
            max_workers = MAX_PARALLEL_INGESTIONS,
            thread_name_prefix = "ingest-worker",
        )

    return _executor


# ── Progress callback ──────────────────────────────────────────────────────────

def _make_progress_cb(task_id: str):
    """
    Return a progress callback for the given task.

    The callback is called from worker threads and updates the task store.
    It is thread-safe (task_store uses its own lock).
    """
    def cb(pct: float, stage: str, **kwargs: Any) -> None:
        # task_store.mark_stage handles the lock + persist.
        task_store.mark_stage(
            task_id,
            stage        = stage,
            pct          = pct,
            nodes_done   = kwargs.get("nodes_done"),
            total_nodes  = kwargs.get("total_nodes"),
            current_node = kwargs.get("current_node"),
            eta_seconds  = kwargs.get("eta_seconds"),
        )

    return cb


# ── PDF Worker function ────────────────────────────────────────────────────────────

def _run_task(task_id: str, doc_id: str, filename: str, resumed: bool = False) -> None:
    """
    Entry point executed in a worker thread.

    Calls run_pipeline(), catches exceptions, and always updates task status
    on exit (success, failure, or cancellation).
    """
    logger.info("Worker started: task_id=%s  doc_id=%s  resumed=%s", task_id, doc_id, resumed)
    task_store.mark_running(task_id, resumed=resumed)

    cancel_flag = _cancel_flags.get(task_id, threading.Event())
    progress_cb = _make_progress_cb(task_id)

    try:
        run_pipeline(
            task_id     = task_id,
            doc_id      = doc_id,
            filename    = filename,
            progress_cb = progress_cb,
            cancelled   = cancel_flag,
        )
    except InterruptedError:
        task_store.mark_cancelled(task_id)
        logger.info("Task cancelled: task_id=%s", task_id)
    except Exception as exc:
        task_store.mark_failed(task_id, str(exc))
        logger.exception("Task failed: task_id=%s", task_id)
    finally:
        # Clean up the cancel flag.
        with _lock:
            _cancel_flags.pop(task_id, None)


# ── IMAGE: standalone image worker ────────────────────────────────────────────
 
def _run_image_task(
    task_id:    str,
    doc_id:     str,
    filename:   str,
    image_path: Path,
) -> None:
    """Worker thread for standalone image ingestion."""
    logger.info(
        "Image worker started: task_id=%s  doc_id=%s  file=%s",
        task_id, doc_id, filename,
    )

    task_store.mark_running(task_id)
 
    cancel_flag = _cancel_flags.get(task_id, threading.Event())
    progress_cb = _make_progress_cb(task_id)
 
    try:
        from services.ingestion_pipeline import run_image_pipeline
        run_image_pipeline(
            task_id     = task_id,
            doc_id      = doc_id,
            filename    = filename,
            image_path  = image_path,
            progress_cb = progress_cb,
            cancelled   = cancel_flag,
        )
    except InterruptedError:
        task_store.mark_cancelled(task_id)
        logger.info("Image task cancelled: task_id=%s", task_id)
    except Exception as exc:
        task_store.mark_failed(task_id, str(exc))
        logger.exception("Image task failed: task_id=%s", task_id)
    finally:
        with _lock:
            _cancel_flags.pop(task_id, None)


# ── Public API ─────────────────────────────────────────────────────────────────

def submit(task_id: str, doc_id: str, filename: str) -> None:
    """
    Submit a new ingestion task to the background worker pool.

    Returns immediately — the actual work runs in a thread.
    """
    with _lock:
        flag = threading.Event()
        _cancel_flags[task_id] = flag

    executor = _get_executor()
    executor.submit(_run_task, task_id, doc_id, filename, False)
    logger.info("Task submitted: task_id=%s", task_id)


# ── IMAGE: new submit for standalone images ───────────────────────────────────
 
def submit_image(
    task_id:    str,
    doc_id:     str,
    filename:   str,
    image_path: Path,
) -> None:
    """Submit a standalone image ingestion task to the background worker pool."""
    with _lock:
        flag = threading.Event()
        _cancel_flags[task_id] = flag

    _get_executor().submit(_run_image_task, task_id, doc_id, filename, image_path)
    logger.info("Image task submitted: task_id=%s  file=%s", task_id, filename)


def startup_resume() -> None:
    """
    Re-queue any tasks that were interrupted when the process last died.

    Called from FastAPI lifespan startup.  Each interrupted task is submitted
    to the worker pool — run_pipeline will fast-forward past already-completed
    stages using the checkpoint sidecar.
    """
    interrupted = task_store.get_interrupted()

    if not interrupted:
        logger.info("No interrupted tasks to resume.")
        return

    logger.info("Resuming %d interrupted task(s)...", len(interrupted))
    
    for rec in interrupted:
        # Reset status to queued so the worker picks it up.
        task_store.update(rec.task_id, status="queued")

        with _lock:
            flag = threading.Event()
            _cancel_flags[rec.task_id] = flag

        executor = _get_executor()
        executor.submit(_run_task, rec.task_id, rec.doc_id, rec.filename, True)
        logger.info("Resumed task: task_id=%s  last_stage=%s", rec.task_id, rec.stage)


def cancel(task_id: str) -> bool:
    """
    Request cancellation of a running task.

    Sets the cancel flag — the pipeline will stop at the next checkpoint.
    Returns True if the task was found and the flag was set.
    """
    with _lock:
        flag = _cancel_flags.get(task_id)
        if flag is not None:
            flag.set()
            logger.info("Cancel requested: task_id=%s", task_id)
            return True

    # Task is not running (maybe queued).  Mark directly.
    rec = task_store.get(task_id)
    if rec and not rec.is_terminal:
        task_store.mark_cancelled(task_id)
        return True

    return False


def get_status(task_id: str) -> TaskRecord | None:
    return task_store.get(task_id)


def get_all_active() -> list[TaskRecord]:
    return task_store.list_active()


def shutdown() -> None:
    """Graceful shutdown — wait for running tasks to reach their next checkpoint."""
    global _executor
    if _executor:
        logger.info("Shutting down ingestion worker pool...")
        _executor.shutdown(wait=True)
        _executor = None
        logger.info("Worker pool shut down.")