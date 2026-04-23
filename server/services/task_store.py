"""
services/task_store.py — Persistent ingestion task registry.

Every ingestion task (one per uploaded PDF) is tracked here from the moment
the file arrives until it is fully indexed.  The store is backed by a JSON
file on disk so it survives process restarts, power cuts, and system failures.

Task lifecycle
--------------
  queued → running → (checkpointed repeatedly) → done
                  ↘ failed
                  ↘ cancelled

A task that is "running" when the process dies is automatically detected on
next startup and re-queued for resumption from its last checkpoint.

Checkpoint stages (in order)
-----------------------------
  uploaded        : PDF written to DOCS_DIR.
  markdown        : PDF converted to Markdown string.
  tree_built      : Hierarchical TreeNode tree constructed.
  summarised      : All nodes have LLM summaries  ← heaviest step, node-by-node progress tracked.
  embedded        : All node summaries embedded.
  indexed         : FAISS index built and saved.
  done            : tree JSON + meta written; task complete.

The stage name is the LAST SUCCESSFULLY COMPLETED stage.  On resume, the
pipeline fast-forwards past already-completed stages.

Public surface
--------------
  create(doc_id, filename)               → TaskRecord
  get(task_id)                           → TaskRecord | None
  list_all()                             → list[TaskRecord]
  list_active()                          → list[TaskRecord]
  update(task_id, **fields)              → None
  mark_running(task_id)                  → None
  mark_stage(task_id, stage, pct)        → None
  mark_done(task_id, nodes)              → None
  mark_failed(task_id, error)            → None
  mark_cancelled(task_id)               → None
  get_interrupted()                      → list[TaskRecord]   (was running, now process is gone)
  delete(task_id)                        → None
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from config import BASE_DIR

logger = logging.getLogger(__name__)

# ── Storage path ───────────────────────────────────────────────────────────────
TASKS_DIR:  Path = BASE_DIR / "tasks"
TASKS_FILE: Path = TASKS_DIR / "tasks.json"
TASKS_DIR.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()

# ── Stage ordering ─────────────────────────────────────────────────────────────
STAGES: list[str] = [
    "queued",
    "uploaded",
    "markdown",
    "tree_built",
    "summarised",
    "embedded",
    "indexed",
    "done",
]

# Percentage boundaries for each completed stage.
# summarised is the heaviest — it goes from 20% to 70% with per-node granularity.
STAGE_PCT: dict[str, float] = {
    "queued":     0.0,
    "uploaded":   5.0,
    "markdown":   10.0,
    "tree_built": 20.0,
    "summarised": 70.0,   # reached only when ALL nodes are done
    "embedded":   80.0,
    "indexed":    90.0,
    "done":       100.0,
}

# Approximate seconds each stage takes (used for ETA estimation).
# These are updated dynamically based on observed times.
_STAGE_SECONDS_ESTIMATE: dict[str, float] = {
    "uploaded":   3.0,
    "markdown":   8.0,
    "tree_built": 2.0,
    "summarised": 120.0,  # highly variable — refined per-node
    "embedded":   10.0,
    "indexed":    3.0,
    "done":       1.0,
}


# ── Data model ─────────────────────────────────────────────────────────────────

@dataclass
class TaskRecord:
    task_id:         str
    doc_id:          str
    filename:        str
    status:          str          = "queued"      # queued | running | done | failed | cancelled
    stage:           str          = "queued"      # last completed stage
    pct:             float        = 0.0           # 0–100
    total_nodes:     int          = 0             # filled after tree_built
    nodes_done:      int          = 0             # nodes summarised so far
    eta_seconds:     float | None = None          # estimated seconds remaining
    created_at:      float        = field(default_factory=time.time)
    started_at:      float | None = None
    completed_at:    float | None = None
    resumed_at:      float | None = None
    error:           str | None   = None
    current_node:    str | None   = None          # node being processed right now
    elapsed_seconds: float        = 0.0           # total wall-clock time spent

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "TaskRecord":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    @property
    def is_terminal(self) -> bool:
        return self.status in ("done", "failed", "cancelled")

    @property
    def is_resumable(self) -> bool:
        """True if this task can be restarted from its last checkpoint."""
        return self.status in ("queued", "running", "failed") and self.stage != "done"


# ── In-memory store ────────────────────────────────────────────────────────────

_tasks: dict[str, TaskRecord] = {}


def _load() -> None:
    global _tasks
    if not TASKS_FILE.exists():
        return
    try:
        data = json.loads(TASKS_FILE.read_text(encoding="utf-8"))
        for entry in data.values():
            rec = TaskRecord.from_dict(entry)
            # Any task that was "running" when the process died becomes "interrupted".
            # We'll detect these on startup and re-queue them.
            if rec.status == "running":
                rec.status = "interrupted"
            _tasks[rec.task_id] = rec
        logger.info("Task store loaded: %d tasks.", len(_tasks))
    except Exception as exc:
        logger.warning("Could not load task store: %s", exc)


def _save() -> None:
    try:
        TASKS_FILE.write_text(
            json.dumps({tid: t.to_dict() for tid, t in _tasks.items()},
                       indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("Could not persist task store: %s", exc)


_load()


# ── Public API ─────────────────────────────────────────────────────────────────

def create(doc_id: str, filename: str) -> TaskRecord:
    """Create a new task record and persist it."""
    task_id = uuid.uuid4().hex
    rec = TaskRecord(task_id=task_id, doc_id=doc_id, filename=filename)
    with _lock:
        _tasks[task_id] = rec
        _save()
    logger.info("Task created: task_id=%s  doc_id=%s  file=%s", task_id, doc_id, filename)
    return rec


def get(task_id: str) -> TaskRecord | None:
    with _lock:
        return _tasks.get(task_id)


def list_all() -> list[TaskRecord]:
    with _lock:
        return sorted(_tasks.values(), key=lambda t: t.created_at, reverse=True)


def list_active() -> list[TaskRecord]:
    """Tasks that are queued, running, or interrupted (not terminal)."""
    with _lock:
        return [t for t in _tasks.values() if not t.is_terminal]


def get_interrupted() -> list[TaskRecord]:
    """Tasks that were running when the process last died — need to be resumed."""
    with _lock:
        return [t for t in _tasks.values() if t.status == "interrupted" and t.is_resumable]


def update(task_id: str, **fields: Any) -> None:
    """Update arbitrary fields on a task and persist."""
    with _lock:
        rec = _tasks.get(task_id)
        if rec is None:
            return
        for k, v in fields.items():
            if hasattr(rec, k):
                setattr(rec, k, v)
        _save()


def mark_running(task_id: str, resumed: bool = False) -> None:
    now = time.time()
    fields: dict[str, Any] = {"status": "running"}
    if not resumed:
        fields["started_at"] = now
    else:
        fields["resumed_at"] = now
    update(task_id, **fields)


def mark_stage(
    task_id:      str,
    stage:        str,
    pct:          float | None = None,
    nodes_done:   int   | None = None,
    total_nodes:  int   | None = None,
    current_node: str   | None = None,
    eta_seconds:  float | None = None,
) -> None:
    """
    Record progress through a pipeline stage.

    Called both when a whole stage completes AND during the summarise
    stage for per-node granularity.
    """
    fields: dict[str, Any] = {"stage": stage}
    if pct is not None:
        fields["pct"] = round(pct, 1)
    if nodes_done is not None:
        fields["nodes_done"] = nodes_done
    if total_nodes is not None:
        fields["total_nodes"] = total_nodes
    if current_node is not None:
        fields["current_node"] = current_node
    if eta_seconds is not None:
        fields["eta_seconds"] = round(eta_seconds, 0)
    update(task_id, **fields)


def mark_done(task_id: str, nodes: int) -> None:
    now = time.time()
    rec = get(task_id)
    elapsed = (now - rec.started_at) if rec and rec.started_at else 0.0
    update(
        task_id,
        status       = "done",
        stage        = "done",
        pct          = 100.0,
        nodes_done   = nodes,
        total_nodes  = nodes,
        eta_seconds  = 0.0,
        current_node = None,
        completed_at = now,
        elapsed_seconds = elapsed,
    )
    logger.info("Task done: task_id=%s  nodes=%d  elapsed=%.0fs", task_id, nodes, elapsed)


def mark_failed(task_id: str, error: str) -> None:
    update(task_id, status="failed", error=error[:500], eta_seconds=None, current_node=None)
    logger.error("Task failed: task_id=%s  error=%s", task_id, error[:120])


def mark_cancelled(task_id: str) -> None:
    update(task_id, status="cancelled", eta_seconds=None, current_node=None)
    logger.info("Task cancelled: task_id=%s", task_id)


def delete(task_id: str) -> None:
    with _lock:
        _tasks.pop(task_id, None)
        _save()