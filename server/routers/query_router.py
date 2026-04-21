"""
routers/query_router.py — HTTP endpoints for querying the knowledge base.

Thin router — all logic is in query_service and the core modules.

Endpoints
---------
  POST /api/query       Answer a natural-language question.
  GET  /api/documents   List all ingested documents.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, status

from models.schemas import DocumentInfo, DocumentListResponse, QueryRequest, QueryResponse
from services.ingestion_service import read_all_meta
from services.query_service import answer_query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Query"])


# =============================================================================
#  QUERY
# =============================================================================

@router.post(
    "/query",
    response_model=QueryResponse,
    summary="Answer a natural-language question from the knowledge base",
    status_code=status.HTTP_200_OK,
)
async def query_endpoint(request: QueryRequest) -> QueryResponse:
    """
    Search ingested documents and return a grounded answer with citations.

    Request body
    ------------
    ```json
    {
      "query": "What is the patient discharge procedure?",
      "doc_ids": ["abc123", "def456"]   // optional; omit to search ALL docs
    }
    ```

    Response body
    -------------
    ```json
    {
      "status": "success",
      "answer": "Patients are discharged after ...",
      "sources": [
        {"doc_id": "abc123", "node_id": "0007",
         "title": "Discharge Procedures", "filename": "policy.pdf"}
      ],
      "thinking": "The query asks about discharge ..."
    }
    ```

    The `thinking` field contains the LLM's chain-of-thought from the tree
    search phase.  It is intended for developer/audit use.  The frontend
    may display or hide it depending on context.
    """
    logger.info(
        "Query request: query_len=%d  doc_ids=%s",
        len(request.query),
        request.doc_ids or "ALL",
    )
    return await answer_query(request)


# =============================================================================
#  LIST DOCUMENTS
# =============================================================================

@router.get(
    "/documents",
    response_model=DocumentListResponse,
    summary="List all ingested documents",
    status_code=status.HTTP_200_OK,
)
def list_documents() -> DocumentListResponse:
    """
    Return metadata for every document that has been successfully ingested.

    This endpoint reads lightweight sidecar .meta.json files rather than
    loading full tree indexes, so it is very fast even with thousands of
    documents.

    Response body
    -------------
    ```json
    {
      "status": "success",
      "total": 2,
      "documents": [
        {"doc_id": "abc123", "filename": "policy.pdf", "nodes": 42},
        {"doc_id": "def456", "filename": "manual.pdf", "nodes": 91}
      ]
    }
    ```
    """
    raw_metas = read_all_meta()
    documents = [
        DocumentInfo(
            doc_id   = m["doc_id"],
            filename = m["filename"],
            nodes    = m["nodes"],
        )
        for m in raw_metas
    ]

    return DocumentListResponse(
        status    = "success",
        documents = documents,
        total     = len(documents),
    )