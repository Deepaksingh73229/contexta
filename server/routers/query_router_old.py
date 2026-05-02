"""
routers/query_router.py — Query and document list endpoints.

Permission guards:
  query        : QUERY_EXECUTE   (all roles)
  documents    : DOCUMENTS_LIST  (ADMIN, MANAGER, ANALYST)
  cache manage : CACHE_MANAGE    (ADMIN, MANAGER)
"""
from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, status
from auth.dependencies import require_permission
from auth.permissions import Permission
from auth.store import UserRecord
from models.schemas import (
    CacheStatsResponse, DocumentInfo, DocumentListResponse,
    QueryRequest, QueryResponse,
)
from services.ingestion_service import read_all_meta
from services.query_service import answer_query, _tree_cache, _faiss_cache
from services import query_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Query"])


@router.post("/query", response_model=QueryResponse, status_code=status.HTTP_200_OK)
async def query_endpoint(
    request:      QueryRequest,
    current_user: UserRecord = Depends(require_permission(Permission.QUERY_EXECUTE)),
) -> QueryResponse:
    """
    Multi-agent query pipeline.
    Requires: query:execute (ALL roles: ADMIN, MANAGER, ANALYST, VIEWER)
    """
    logger.info("Query: user=%s  len=%d", current_user.username, len(request.query))
    from auth.store import audit
    result = await answer_query(request)
    audit(current_user.user_id, "query.execute",
          f"Query by '{current_user.username}': {request.query[:80]}")
    return result


@router.get("/documents", response_model=DocumentListResponse, status_code=status.HTTP_200_OK)
def list_documents(
    current_user: UserRecord = Depends(require_permission(Permission.DOCUMENTS_LIST)),
) -> DocumentListResponse:
    """
    List all ingested documents.
    Requires: documents:list (ADMIN, MANAGER, ANALYST)
    """
    raw_metas = read_all_meta()
    documents = [DocumentInfo(doc_id=m["doc_id"], filename=m["filename"], nodes=m["nodes"])
                 for m in raw_metas]
    return DocumentListResponse(status="success", documents=documents, total=len(documents))


@router.get("/cache/stats", response_model=CacheStatsResponse, status_code=status.HTTP_200_OK)
def cache_stats(
    current_user: UserRecord = Depends(require_permission(Permission.CACHE_VIEW)),
) -> CacheStatsResponse:
    """
    Query cache statistics.
    Requires: cache:view (ADMIN, MANAGER, ANALYST)
    """
    s = query_cache.stats()
    return CacheStatsResponse(status="success", **s)


@router.delete("/cache", status_code=status.HTTP_200_OK)
def clear_cache(
    current_user: UserRecord = Depends(require_permission(Permission.CACHE_MANAGE)),
) -> dict:
    """
    Clear query cache + in-memory index cache.
    Requires: cache:manage (ADMIN, MANAGER)
    """
    import services.query_cache as qc
    with qc._lock:
        qc._cache.clear()
        qc._access_order.clear()
        qc._save()
    _tree_cache.clear()
    _faiss_cache.clear()
    from auth.store import audit
    audit(current_user.user_id, "cache.clear", "Query cache cleared")
    return {"status": "success", "message": "Query cache and index cache cleared."}