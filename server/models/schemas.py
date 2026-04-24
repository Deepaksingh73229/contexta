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
    status:   str
    task_id:  str
    doc_id:   str
    filename: str
    message:  str


class TaskStatusResponse(BaseModel):
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
    query:   str       = Field(..., min_length=1, max_length=2000)
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
    """
    Full query response — now includes multi-agent structured metadata.

    Fields
    ------
    answer          : The main answer text (intent-formatted).
    confidence      : HIGH | MEDIUM | LOW — how well the context supported the answer.
    intent_type     : Classified query intent (DEFINITION, PROCEDURE, LOOKUP, etc.)
    search_focus    : What the agents were searching for (1 sentence).
    gaps            : Topics the documents did NOT cover (honest about limits).
    sources         : Retrieved document sections with doc + node IDs.
    thinking        : Full multi-agent reasoning trace.
    elapsed_ms      : Total pipeline time in milliseconds.
    """
    status:       str
    answer:       str
    confidence:   str              = "MEDIUM"
    intent_type:  str              = "LOOKUP"
    search_focus: str              = ""
    gaps:         list[str]        = Field(default_factory=list)
    sources:      list[SourceCitation]
    thinking:     str
    elapsed_ms:   float            = 0.0


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