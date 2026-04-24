"""
routers/tasks_router.py — Ingestion task management endpoints.

Permission guards:
  view progress  : INGEST_VIEW_PROGRESS
  cancel/delete  : TASKS_CANCEL
  view all users : TASKS_VIEW_ALL
"""
from __future__ import annotations
import asyncio
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from auth.dependencies import require_permission, get_current_user
from auth.permissions import Permission
from auth.store import UserRecord
from models.schemas import TaskListResponse, TaskStatusResponse
from services import task_manager, task_store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


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


@router.get("", response_model=TaskListResponse)
def list_tasks(
    include_done: bool = False,
    current_user: UserRecord = Depends(require_permission(Permission.INGEST_VIEW_PROGRESS)),
) -> TaskListResponse:
    """
    List ingestion tasks.
    Requires: ingest:view_progress (ADMIN, MANAGER, ANALYST)
    """
    records = task_store.list_all() if include_done else task_store.list_active()
    return TaskListResponse(status="success", tasks=[_to_response(r) for r in records], total=len(records))


@router.get("/{task_id}", response_model=TaskStatusResponse)
def get_task(
    task_id: str,
    current_user: UserRecord = Depends(require_permission(Permission.INGEST_VIEW_PROGRESS)),
) -> TaskStatusResponse:
    """
    Get live status for one task.
    Requires: ingest:view_progress (ADMIN, MANAGER, ANALYST)
    """
    rec = task_store.get(task_id)
    if rec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Task '{task_id}' not found.")
    return _to_response(rec)


@router.get("/{task_id}/stream")
async def stream_task(
    task_id: str,
    current_user: UserRecord = Depends(require_permission(Permission.INGEST_VIEW_PROGRESS)),
) -> StreamingResponse:
    """
    SSE stream for live task progress.
    Requires: ingest:view_progress (ADMIN, MANAGER, ANALYST)
    """
    rec = task_store.get(task_id)
    if rec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Task '{task_id}' not found.")

    async def _generate() -> AsyncGenerator[str, None]:
        while True:
            current = task_store.get(task_id)
            if current is None:
                yield 'data: {"error": "task not found"}\n\n'
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
        media_type = "text/event-stream",
        headers    = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{task_id}/cancel", status_code=status.HTTP_200_OK)
def cancel_task(
    task_id: str,
    current_user: UserRecord = Depends(require_permission(Permission.TASKS_CANCEL)),
) -> dict:
    """
    Cancel a running task.
    Requires: tasks:cancel (ADMIN, MANAGER)
    """
    rec = task_store.get(task_id)
    if rec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Task '{task_id}' not found.")
    if rec.is_terminal:
        return {"status": "noop", "message": f"Task is already {rec.status}."}
    cancelled = task_manager.cancel(task_id)
    from auth.store import audit
    audit(current_user.user_id, "task.cancel", f"Cancelled task {task_id}")
    return {"status": "success" if cancelled else "noop",
            "message": "Cancellation requested." if cancelled else "Could not cancel."}


@router.delete("/{task_id}", status_code=status.HTTP_200_OK)
def delete_task(
    task_id: str,
    current_user: UserRecord = Depends(require_permission(Permission.TASKS_CANCEL)),
) -> dict:
    """
    Delete a terminal task record.
    Requires: tasks:cancel (ADMIN, MANAGER)
    """
    rec = task_store.get(task_id)
    if rec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Task '{task_id}' not found.")
    if not rec.is_terminal:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cancel the task first.")
    task_store.delete(task_id)
    return {"status": "success", "message": f"Task '{task_id}' deleted."}