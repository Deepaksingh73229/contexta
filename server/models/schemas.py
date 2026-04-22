"""
models/schemas.py — Pydantic request and response schemas.

Enterprise additions:
  - QueryResponse.thinking now includes rewrite + variant info.
  - CacheStatsResponse for the new /api/cache/stats endpoint.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


# ── Ingest ─────────────────────────────────────────────────────────────────────

class IngestResponse(BaseModel):
    status:   str
    doc_id:   str
    filename: str
    nodes:    int
    message:  str


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
    thinking: str   # includes: original query, rewritten query, variants


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