"""
models/schemas.py — Pydantic request and response schemas.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ── Ingest (legacy) ────────────────────────────────────────────────────────────

class IngestResponse(BaseModel):
    status:   str
    doc_id:   str
    filename: str
    nodes:    int
    message:  str


# ── Async ingest task ──────────────────────────────────────────────────────────

class TaskAcceptedResponse(BaseModel):
    """Returned immediately on upload — pipeline runs in background."""
    status:   str
    task_id:  str
    doc_id:   str
    filename: str
    message:  str


class TaskStatusResponse(BaseModel):
    """Live progress for one ingestion task."""
    task_id:         str
    doc_id:          str
    filename:        str
    status:          str
    stage:           str
    pct:             float
    total_nodes:     int
    nodes_done:      int
    eta_seconds:     Optional[float]
    current_node:    Optional[str]
    elapsed_seconds: float
    error:           Optional[str]
    created_at:      float
    started_at:      Optional[float]
    completed_at:    Optional[float]
    stage_label:     str = ""

    def model_post_init(self, __context) -> None:
        _labels = {
            "queued":        "Queued",
            "uploaded":      "File uploaded",
            "markdown":      "Converting PDF",
            "building_tree": "Building structure",
            "tree_built":    "Structure ready",
            "summarising":   "Summarising sections",
            "summarised":    "Sections summarised",
            "embedding":     "Generating embeddings",
            "embedded":      "Embeddings ready",
            "indexing":      "Building search index",
            "indexed":       "Index ready",
            "saving":        "Saving to disk",
            "done":          "Complete",
            "failed":        "Failed",
            "cancelled":     "Cancelled",
            "interrupted":   "Interrupted — will resume",
        }
        self.stage_label = _labels.get(self.stage, self.stage.replace("_", " ").capitalize())


class TaskListResponse(BaseModel):
    status: str
    tasks:  list[TaskStatusResponse]
    total:  int


# ── Query ──────────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    doc_ids: list[str] = Field(default_factory=list)

    @field_validator("query", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v


class SourceCitation(BaseModel):
    doc_id:   str
    node_id:  str
    title:    str
    filename: str


class QueryResponse(BaseModel):
    status:   str
    answer:   str
    sources:  list[SourceCitation]
    thinking: str


# ── Documents list ─────────────────────────────────────────────────────────────

class DocumentInfo(BaseModel):
    doc_id:   str
    filename: str
    nodes:    int


class DocumentListResponse(BaseModel):
    status:    str
    documents: list[DocumentInfo]
    total:     int


# ── Cache stats ────────────────────────────────────────────────────────────────

class CacheStatsResponse(BaseModel):
    status:       str
    entries:      int
    max_entries:  int
    ttl_seconds:  int
    enabled:      bool