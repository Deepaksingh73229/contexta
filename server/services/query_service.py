"""
services/query_service.py — Query orchestration service.

Direct retrieval pipeline with zero pre-answer LLM calls.

Public surface
--------------
  answer_query(request) → QueryResponse
  invalidate_doc_caches(doc_id) → None
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import HTTPException, status

from config import TREE_DIR, MULTI_QUERY_ENABLED, MULTI_QUERY_COUNT
from core.direct_retriever import (
    DirectResult,
    direct_retrieve_and_answer,
    warm_cross_encoder,
    build_context_string,
    generate_answer,
)
from core.embeddings import load_faiss_index, FaissIndex
from core.tree import load_tree, create_node_map, TreeNode
from models.schemas import QueryRequest, QueryResponse, SourceCitation
from services.ingestion_service import get_doc_titles
from services import query_cache

logger = logging.getLogger(__name__)

# ── Pre-warm cross-encoder at import time (eliminates cold-start double-load) ──
warm_cross_encoder()


# ── In-memory caches (tree JSON + FAISS index, keyed by doc_id) ───────────────

_tree_cache:  dict[str, TreeNode]   = {}
_faiss_cache: dict[str, FaissIndex] = {}


def _load_tree_cached(doc_id: str) -> TreeNode:
    if doc_id not in _tree_cache:
        path = TREE_DIR / f"{doc_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"Tree not found: {doc_id}")
        _tree_cache[doc_id] = load_tree(path)
    return _tree_cache[doc_id]


def _load_faiss_cached(doc_id: str) -> FaissIndex | None:
    if doc_id not in _faiss_cache:
        faiss_path = TREE_DIR / doc_id
        try:
            _faiss_cache[doc_id] = load_faiss_index(faiss_path)
        except FileNotFoundError:
            # Legacy docs: build FAISS inline from tree embeddings.
            try:
                tree      = _load_tree_cached(doc_id)
                all_nodes = tree.all_nodes()
                node_ids  = [n.node_id for n in all_nodes if n.embedding]
                embeds    = [n.embedding for n in all_nodes if n.embedding]
                if node_ids:
                    from core.embeddings import build_faiss_index
                    _faiss_cache[doc_id] = build_faiss_index(node_ids, embeds)
                    logger.warning("Built FAISS inline for legacy doc_id=%s", doc_id)
                else:
                    return None
            except Exception as exc:
                logger.error("Cannot build FAISS for doc_id=%s: %s", doc_id, exc)
                return None
    return _faiss_cache.get(doc_id)


def invalidate_doc_caches(doc_id: str) -> None:
    """Invalidate in-memory tree and FAISS caches.

    Parameters
    ----------
    doc_id : Document ID to invalidate, or "__all__" to clear everything.

    Called automatically by the ingestion pipeline when a document is re-indexed,
    and by the cache clear endpoint.
    """
    global _tree_cache, _faiss_cache
    if doc_id == "__all__":
        _tree_cache.clear()
        _faiss_cache.clear()
        logger.info("Invalidated all query-service caches.")
    else:
        _tree_cache.pop(doc_id, None)
        _faiss_cache.pop(doc_id, None)
        logger.info("Invalidated query-service caches for doc_id=%s", doc_id)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _all_doc_ids() -> list[str]:
    return [
        p.stem for p in sorted(TREE_DIR.glob("*.json"))
        if not p.stem.endswith(".meta") and not p.stem.endswith(".checkpoint")
    ]


def _filename_for_doc(doc_id: str) -> str:
    meta_path = TREE_DIR / f"{doc_id}.meta.json"
    try:
        return json.loads(meta_path.read_text(encoding="utf-8")).get("filename", doc_id)
    except Exception:
        return doc_id


def _build_trees_and_indexes(
    doc_ids: list[str],
) -> list[tuple[str, str, TreeNode, FaissIndex]]:
    """
    Load (or retrieve from memory cache) all trees and FAISS indexes.
    Returns list of (doc_id, filename, tree, faiss_index).
    Skips documents that have no FAISS index yet (still ingesting).
    """
    result = []
    for doc_id in doc_ids:
        try:
            tree  = _load_tree_cached(doc_id)
            faiss = _load_faiss_cached(doc_id)
            if faiss is None:
                logger.warning("Skipping doc_id=%s — no FAISS index.", doc_id)
                continue
            filename = _filename_for_doc(doc_id)
            result.append((doc_id, filename, tree, faiss))
        except Exception as exc:
            logger.warning("Could not load doc_id=%s: %s", doc_id, exc)
    return result


def _direct_result_to_sources(
    result:            DirectResult,
    trees_and_indexes: list[tuple[str, str, TreeNode, FaissIndex]],
) -> list[SourceCitation]:
    """Convert DirectResult.sources to SourceCitation Pydantic objects."""
    citations = []
    seen: set[str] = set()
    for nid, score, title, doc_id, filename in result.sources:
        if nid not in seen:
            citations.append(SourceCitation(
                doc_id   = doc_id,
                node_id  = nid,
                title    = title,
                filename = filename,
            ))
            seen.add(nid)
    return citations


# ── Cache helpers ──────────────────────────────────────────────────────────────

def _cache_key_doc_ids(target_ids: list[str]) -> list[str]:
    return sorted(target_ids)


def _try_cache_hit(
    query:             str,
    target_ids:        list[str],
    trees_and_indexes: list[tuple[str, str, TreeNode, FaissIndex]],
) -> QueryResponse | None:
    """
    Check the query cache and return a QueryResponse if there's a valid hit.
    Returns None on miss.
    """
    import time
    t0 = time.perf_counter()

    cache_hit = query_cache.get(query, doc_ids=target_ids)
    if cache_hit is None:
        return None

    try:
        # Re-generate answer from cached node IDs (fresh LLM call, same retrieval).
        merged_node_map: dict[str, TreeNode] = {}
        sources: list[SourceCitation] = []

        for doc_id, filename, tree, _ in trees_and_indexes:
            nm = create_node_map(tree)
            merged_node_map.update(nm)
            for nid in cache_hit.node_ids:
                if nid in nm:
                    sources.append(SourceCitation(
                        doc_id   = doc_id,
                        node_id  = nid,
                        title    = nm[nid].title,
                        filename = filename,
                    ))

        context = build_context_string(cache_hit.node_ids, merged_node_map)
        answer  = generate_answer(query, context)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        return QueryResponse(
            status       = "success",
            answer       = answer,
            confidence   = "HIGH",
            intent_type  = "LOOKUP",
            search_focus = "",
            gaps         = [],
            sources      = sources,
            thinking     = f"[Cache hit — age {cache_hit.age_s:.0f}s]\nNodes: {cache_hit.node_ids}",
            elapsed_ms   = elapsed_ms,
        )
    except Exception as exc:
        logger.warning("Cache hit reconstruction failed (%s). Treating as miss.", exc)
        return None


# ── Public service function ────────────────────────────────────────────────────

async def answer_query(request: QueryRequest) -> QueryResponse:
    """
    Route a user query through the direct retrieval pipeline.

    Flow
    ----
    1. Cache lookup — return immediately if hit.
    2. Load trees + FAISS indexes (from in-memory cache).
    3. Run direct_retrieve_and_answer() — deterministic expansion + MMR + rerank.
    4. Store result in query cache.
    5. Return structured QueryResponse.
    """
    import time
    t0 = time.perf_counter()

    try:
        target_ids = request.doc_ids or _all_doc_ids()

        # No documents ingested at all.
        if not target_ids:
            return QueryResponse(
                status       = "success",
                answer       = "No documents have been ingested yet. Please upload a document first.",
                confidence   = "LOW",
                intent_type  = "LOOKUP",
                search_focus = "",
                gaps         = ["No documents in the knowledge base."],
                sources      = [],
                thinking     = "",
                elapsed_ms   = 0.0,
            )

        # ── 1. Cache lookup ───────────────────────────────────────────────────
        trees_and_indexes = _build_trees_and_indexes(target_ids)

        if trees_and_indexes:
            cached_response = _try_cache_hit(request.query, target_ids, trees_and_indexes)
            if cached_response is not None:
                return cached_response

        # ── 2. Validate we have something to search ───────────────────────────
        if not trees_and_indexes:
            return QueryResponse(
                status       = "success",
                answer       = "No indexed documents are available to search.",
                confidence   = "LOW",
                intent_type  = "LOOKUP",
                search_focus = "",
                gaps         = ["No FAISS indexes found. Documents may still be ingesting."],
                sources      = [],
                thinking     = "",
                elapsed_ms   = 0.0,
            )

        # ── 3. Direct retrieval pipeline ──────────────────────────────────────
        result: DirectResult = direct_retrieve_and_answer(
            raw_query          = request.query,
            trees_and_indexes  = trees_and_indexes,
            top_k              = 5,
            max_query_variants = max(2, min(6, MULTI_QUERY_COUNT)) if MULTI_QUERY_ENABLED else 1,
        )

        # ── 4. Build sources ──────────────────────────────────────────────────
        sources = _direct_result_to_sources(result, trees_and_indexes)

        # ── 5. Store in query cache ───────────────────────────────────────────
        if result.sources:
            node_ids_to_cache = [nid for nid, _, _, _, _ in result.sources]
            doc_ids_in_result = list({doc_id for _, _, _, doc_id, _ in result.sources})
            query_cache.put(
                raw_query = request.query,
                node_ids  = node_ids_to_cache,
                doc_ids   = doc_ids_in_result,
            )

        elapsed_ms = (time.perf_counter() - t0) * 1000

        logger.info(
            "Query complete: confidence=%s  sources=%d  elapsed=%.0fms",
            result.confidence, len(sources), elapsed_ms,
        )

        return QueryResponse(
            status       = "success",
            answer       = result.answer,
            confidence   = result.confidence,
            intent_type  = "LOOKUP",
            search_focus = f"[{result.query_variants[0]}]" if result.query_variants else "",
            gaps         = result.gaps if hasattr(result, "gaps") else [],
            sources      = sources,
            thinking     = result.thinking,
            elapsed_ms   = elapsed_ms,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Query service error: query=%r", request.query[:60])
        raise HTTPException(
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail      = "An error occurred while processing your query. Please try again.",
        ) from exc