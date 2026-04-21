"""
models/schemas.py — Pydantic request and response schemas.

Every API schema lives here.  Routers import from this file; they never
define their own Pydantic models inline.  This means:

  • The frontend team has one file to read for the full API contract.
  • Adding a new field to a response requires editing one place only.
  • Validation logic (field_validator, constraints) stays out of routers.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


# =============================================================================
#  INGEST  (POST /api/ingest)
# =============================================================================

class IngestResponse(BaseModel):
    """
    Returned after a document is successfully ingested and indexed.

    doc_id  : Stable UUID hex identifier.  Use this to query the document.
    filename: The original uploaded filename (sanitised, no path components).
    nodes   : Total number of tree nodes built from the document.
    message : Human-readable confirmation string.
    """
    status:   str
    doc_id:   str
    filename: str
    nodes:    int
    message:  str


# =============================================================================
#  QUERY  (POST /api/query)
# =============================================================================

class QueryRequest(BaseModel):
    """
    Payload sent by the frontend to query one or more documents.

    Fields
    ------
    query   : The natural-language question (1–2000 chars).
    doc_ids : Optional list of doc_id strings to restrict the search.
              If omitted (or empty), ALL ingested documents are searched.
    """
    query: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Natural-language question (1–2000 characters).",
    )
    doc_ids: list[str] = Field(
        default_factory=list,
        description=(
            "doc_id strings to search.  "
            "Leave empty to search all ingested documents."
        ),
    )

    @field_validator("query", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        """
        Strip leading/trailing whitespace before length validation.
        Without this, a query of "   " (spaces only) would pass min_length=1.
        """
        if isinstance(v, str):
            return v.strip()
        return v


class SourceCitation(BaseModel):
    """
    One retrieved source section, returned alongside the answer.

    doc_id   : Identifies which document the section came from.
    node_id  : The tree node ID (e.g. "0007") within that document.
    title    : The section heading — human-readable citation.
    filename : The original uploaded filename for display in the UI.
    """
    doc_id:   str
    node_id:  str
    title:    str
    filename: str


class QueryResponse(BaseModel):
    """
    Full response returned after a query is processed.

    status  : "success" or "error".
    answer  : The LLM's grounded answer.
    sources : List of source sections that were retrieved and used.
    thinking: The LLM's chain-of-thought reasoning from tree search.
              Exposed here for developer / audit use; the frontend may hide it.
    """
    status:   str
    answer:   str
    sources:  list[SourceCitation]
    thinking: str


# =============================================================================
#  DOCUMENTS LIST  (GET /api/documents)
# =============================================================================

class DocumentInfo(BaseModel):
    """
    Summary of one ingested document returned by the list endpoint.

    doc_id   : Stable UUID identifier.
    filename : Original upload filename.
    nodes    : Total tree node count (indicates document size / complexity).
    """
    doc_id:   str
    filename: str
    nodes:    int


class DocumentListResponse(BaseModel):
    """Response from GET /api/documents."""
    status:    str
    documents: list[DocumentInfo]
    total:     int


# =============================================================================
#  CITATIONS  (GET /api/cite/{doc_id})
# =============================================================================
# No request schema needed — doc_id comes from the URL path parameter.
# The response is a raw PDF stream (FileResponse), not a JSON model.