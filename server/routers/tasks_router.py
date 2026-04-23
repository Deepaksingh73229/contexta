"""
routers/tasks_router.py — Ingestion task management endpoints.

Endpoints
---------
  GET  /api/tasks                  List all active (+ recent) tasks.
  GET  /api/tasks/{task_id}        Live status for one task (poll-friendly).
  GET  /api/tasks/{task_id}/stream SSE stream — push progress every second.
  POST /api/tasks/{task_id}/cancel Request cancellation of a running task.
  DELETE /api/tasks/{task_id}      Remove a completed/failed task record.

Frontend polling
----------------
For a simple progress bar, poll GET /api/tasks/{task_id} every 1–2 seconds.
The response includes:
  - pct          : 0–100 float
  - stage        : machine-readable stage name
  - stage_label  : human-readable label ("Summarising sections")
  - nodes_done   : how many nodes have been summarised
  - total_nodes  : total nodes in the document
  - eta_seconds  : estimated seconds remaining
  - current_node : title of the section currently being processed
  - status       : queued | running | done | failed | cancelled

For a live push experience, use GET /api/tasks/{task_id}/stream (Server-Sent Events).
The browser receives a JSON event every second until the task is terminal.

Example SSE event:
  data: {"task_id":"abc","pct":42.3,"stage":"summarising","stage_label":"Summarising sections","nodes_done":20,"total_nodes":47,"eta_seconds":324}
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from models.schemas import TaskListResponse, TaskStatusResponse
from services import task_manager, task_store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


# ── Helper: convert TaskRecord → TaskStatusResponse ───────────────────────────

def _to_response(rec: task_store.TaskRecord) -> TaskStatusResponse:
    return TaskStatusResponse(
        task_id         = rec.task_id,
        doc_id          = rec.doc_id,
        filename        = rec.filename,
        status          = rec.status,
        stage           = rec.stage,
        pct             = rec.pct,
        total_nodes     = rec.total_nodes,
        nodes_done      = rec.nodes_done,
        eta_seconds     = rec.eta_seconds,
        current_node    = rec.current_node,
        elapsed_seconds = rec.elapsed_seconds,
        error           = rec.error,
        created_at      = rec.created_at,
        started_at      = rec.started_at,
        completed_at    = rec.completed_at,
    )


# ── GET /api/tasks ─────────────────────────────────────────────────────────────

@router.get("", response_model=TaskListResponse)
def list_tasks(include_done: bool = False) -> TaskListResponse:
    """
    List ingestion tasks.

    Parameters
    ----------
    include_done : If true, include completed/failed/cancelled tasks too.
                   Default false — returns only active tasks.
    """
    if include_done:
        records = task_store.list_all()
    else:
        records = task_store.list_active()

    tasks = [_to_response(r) for r in records]
    return TaskListResponse(status="success", tasks=tasks, total=len(tasks))


# ── GET /api/tasks/{task_id} ───────────────────────────────────────────────────

@router.get("/{task_id}", response_model=TaskStatusResponse)
def get_task(task_id: str) -> TaskStatusResponse:
    """
    Return live status for one task.

    Poll this endpoint every 1–2 seconds to drive a progress bar.
    When status == "done" or "failed", stop polling.
    """
    rec = task_store.get(task_id)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task '{task_id}' not found.",
        )
    return _to_response(rec)


# ── GET /api/tasks/{task_id}/stream (SSE) ─────────────────────────────────────

@router.get("/{task_id}/stream")
async def stream_task(task_id: str) -> StreamingResponse:
    """
    Server-Sent Events stream for live task progress.

    The client receives one JSON event per second until the task reaches
    a terminal state (done / failed / cancelled).

    Usage (browser):
        const es = new EventSource('/api/tasks/{task_id}/stream');
        es.onmessage = e => {
            const data = JSON.parse(e.data);
            updateProgressBar(data.pct, data.stage_label, data.eta_seconds);
            if (['done','failed','cancelled'].includes(data.status)) es.close();
        };
    """
    rec = task_store.get(task_id)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task '{task_id}' not found.",
        )

    async def _generate() -> AsyncGenerator[str, None]:
        while True:
            current = task_store.get(task_id)
            if current is None:
                yield "data: {\"error\": \"task not found\"}\n\n"
                break

            resp = _to_response(current)
            payload = json.dumps({
                "task_id":      resp.task_id,
                "status":       resp.status,
                "stage":        resp.stage,
                "stage_label":  resp.stage_label,
                "pct":          resp.pct,
                "nodes_done":   resp.nodes_done,
                "total_nodes":  resp.total_nodes,
                "eta_seconds":  resp.eta_seconds,
                "current_node": resp.current_node,
                "elapsed_s":    round(resp.elapsed_seconds, 1),
                "error":        resp.error,
            })
            yield f"data: {payload}\n\n"

            if current.is_terminal:
                break

            await asyncio.sleep(1.0)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering
        },
    )


# ── POST /api/tasks/{task_id}/cancel ──────────────────────────────────────────

@router.post("/{task_id}/cancel", status_code=status.HTTP_200_OK)
def cancel_task(task_id: str) -> dict:
    """
    Request cancellation of a running or queued task.

    The pipeline will stop at its next checkpoint (between nodes).
    The partial tree checkpoint is preserved so the task can be resumed
    by re-uploading the same document.
    """
    rec = task_store.get(task_id)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task '{task_id}' not found.",
        )
    if rec.is_terminal:
        return {"status": "noop", "message": f"Task is already {rec.status}."}

    cancelled = task_manager.cancel(task_id)
    if cancelled:
        return {"status": "success", "message": "Cancellation requested. Task will stop at next checkpoint."}
    return {"status": "noop", "message": "Task could not be cancelled (may have just completed)."}


# ── DELETE /api/tasks/{task_id} ───────────────────────────────────────────────

@router.delete("/{task_id}", status_code=status.HTTP_200_OK)
def delete_task(task_id: str) -> dict:
    """
    Remove a task record from the store.

    Only terminal tasks (done/failed/cancelled) can be deleted.
    Running tasks must be cancelled first.
    """
    rec = task_store.get(task_id)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task '{task_id}' not found.",
        )
    if not rec.is_terminal:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete an active task. Cancel it first.",
        )
    task_store.delete(task_id)
    return {"status": "success", "message": f"Task '{task_id}' deleted."}