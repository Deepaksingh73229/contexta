"""
routers/query_router.py — Query and document list endpoints.

Enterprise addition: GET /api/cache/stats
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, status

from models.schemas import (
    CacheStatsResponse,
    DocumentInfo,
    DocumentListResponse,
    QueryRequest,
    QueryResponse,
)
from services.ingestion_service import read_all_meta
from services.query_service import answer_query
from services import query_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Query"])


@router.post(
    "/query",
    response_model=QueryResponse,
    status_code=status.HTTP_200_OK,
)
async def query_endpoint(request: QueryRequest) -> QueryResponse:
    """
    Answer a natural-language question.

    Enterprise pipeline:
      cache lookup → rewrite query → generate variants → beam search →
      hybrid score → cross-encoder rerank → multi-query fusion →
      context build → LLM answer → cache store.

    The `thinking` field in the response includes:
      - original query
      - rewritten query
      - all generated variants
    """
    logger.info("Query: len=%d  doc_ids=%s", len(request.query), request.doc_ids or "ALL")
    return await answer_query(request)


@router.get(
    "/documents",
    response_model=DocumentListResponse,
    status_code=status.HTTP_200_OK,
)
def list_documents() -> DocumentListResponse:
    """List all ingested documents (reads lightweight sidecar metadata)."""
    raw_metas = read_all_meta()
    documents = [
        DocumentInfo(doc_id=m["doc_id"], filename=m["filename"], nodes=m["nodes"])
        for m in raw_metas
    ]
    return DocumentListResponse(status="success", documents=documents, total=len(documents))


@router.get(
    "/cache/stats",
    response_model=CacheStatsResponse,
    status_code=status.HTTP_200_OK,
)
def cache_stats() -> CacheStatsResponse:
    """Return query cache statistics."""
    s = query_cache.stats()
    return CacheStatsResponse(status="success", **s)


@router.delete(
    "/cache",
    status_code=status.HTTP_200_OK,
)
def clear_cache() -> dict:
    """Clear the entire query cache (admin endpoint)."""
    from services.query_cache import _cache, _access_order, _save
    import services.query_cache as qc
    with qc._lock:
        qc._cache.clear()
        qc._access_order.clear()
        qc._save()
    return {"status": "success", "message": "Query cache cleared."}