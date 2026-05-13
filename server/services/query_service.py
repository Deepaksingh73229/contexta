"""
services/query_service.py — Enterprise query orchestration.

Integrates all enterprise retrieval improvements:

  1. Query path cache (fast return for repeated queries)
  2. Query rewriting (LLM aligns query to document vocabulary)
  3. Multi-query generation (N diverse variants → higher recall)
  4. Hierarchical beam search (fast, no LLM in retrieval loop)
  5. Hybrid scoring (semantic + BM25 + metadata)
  6. Cross-encoder re-ranking (high precision final pass)
  7. Multi-query result fusion (union + max-score merge)
  8. Context builder (dedup + parent-child pruning + trim)
  9. LLM answer generation (grounded, no hallucination)

Public surface
--------------
  answer_query(request) → QueryResponse
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import HTTPException, status

from config import TREE_DIR, RETRIEVAL_STAGE2_TOP_K
from core.embeddings import load_faiss_index, FaissIndex
from core.query_processor import process_query
from core.retriever import retrieve_multi_query, generate_answer, build_context
from core.tree import load_tree, create_node_map, TreeNode
from models.schemas import QueryRequest, QueryResponse, SourceCitation
from services.ingestion_service import read_all_meta, get_doc_titles
from services import query_cache

logger = logging.getLogger(__name__)

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

def _resolve_tree_path(doc_id: str) -> Path:
    path = TREE_DIR / f"{doc_id}.json"
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No indexed document found for doc_id '{doc_id}'.",
        )
    return path


def _resolve_faiss_path(doc_id: str) -> Path:
    return TREE_DIR / doc_id   # save_faiss_index adds .faiss / .ids suffixes


def _filename_for_doc(doc_id: str) -> str:
    import json
    meta_path = TREE_DIR / f"{doc_id}.meta.json"
    try:
        return json.loads(meta_path.read_text(encoding="utf-8")).get("filename", doc_id)
    except Exception:
        return doc_id


def _all_doc_ids() -> list[str]:
    return [p.stem for p in sorted(TREE_DIR.glob("*.json")) if not p.stem.endswith(".meta")]


# ── Single-document query ──────────────────────────────────────────────────────

def _query_one_doc(
    doc_id:      str,
    all_queries: list[str],
    raw_query:   str,
) -> tuple[str, list[SourceCitation], list[str]]:
    """
    Run the full enterprise pipeline against a single document.

    Returns
    -------
    (answer, sources, node_ids)
    """
    tree_path  = _resolve_tree_path(doc_id)
    faiss_path = _resolve_faiss_path(doc_id)
    filename   = _filename_for_doc(doc_id)

    tree = load_tree(tree_path)

    # Load FAISS index; fall back gracefully if not found (legacy docs).
    try:
        faiss_index = load_faiss_index(faiss_path)
    except FileNotFoundError:
        logger.warning("FAISS index missing for doc_id=%s — using first-query only.", doc_id)
        faiss_index = None

    # Multi-query retrieval with fusion.
    if faiss_index is not None:
        ranked = retrieve_multi_query(
            tree        = tree,
            faiss_index = faiss_index,
            all_queries = all_queries,
            top_k       = RETRIEVAL_STAGE2_TOP_K,
        )
    else:
        # Fallback: no FAISS — run single-query retrieval using embeddings inline.
        from core.embeddings import embed_text
        from core.embeddings import build_faiss_index as _build
        all_nodes  = tree.all_nodes()
        node_ids_e = [n.node_id for n in all_nodes if n.embedding]
        embeds     = [n.embedding for n in all_nodes if n.embedding]
        if node_ids_e:
            faiss_index = _build(node_ids_e, embeds)
        ranked = retrieve_multi_query(
            tree        = tree,
            faiss_index = faiss_index,
            all_queries = all_queries,
            top_k       = RETRIEVAL_STAGE2_TOP_K,
        ) if faiss_index else []

    node_ids  = [nid for nid, _ in ranked]
    node_map  = create_node_map(tree)
    answer    = generate_answer(node_map, node_ids, raw_query)

    sources = [
        SourceCitation(
            doc_id   = doc_id,
            node_id  = nid,
            title    = node_map[nid].title,
            filename = filename,
        )
        for nid in node_ids
        if nid in node_map
    ]

    return answer, sources, node_ids


# ── Multi-document query ───────────────────────────────────────────────────────

def _query_all_docs(
    doc_ids:     list[str],
    all_queries: list[str],
    raw_query:   str,
) -> tuple[str, list[SourceCitation], list[str]]:
    """
    Search across multiple documents and merge into one grounded answer.

    Strategy:
    1. Run multi-query retrieval per document.
    2. Collect all (node_id, score) pairs from all documents.
    3. Sort globally by score.
    4. Build merged context and generate one answer.
    """
    all_sources:  list[SourceCitation] = []
    global_nodes: dict[str, tuple[float, str, str]] = {}   # node_id → (score, doc_id, filename)
    all_node_maps: dict[str, dict] = {}

    for doc_id in doc_ids:
        index_path = TREE_DIR / f"{doc_id}.json"
        if not index_path.exists():
            logger.warning("Skipping missing index for doc_id=%s", doc_id)
            continue

        try:
            tree      = load_tree(index_path)
            filename  = _filename_for_doc(doc_id)
            node_map  = create_node_map(tree)
            all_node_maps[doc_id] = node_map

            faiss_path = _resolve_faiss_path(doc_id)
            try:
                faiss_index = load_faiss_index(faiss_path)
            except FileNotFoundError:
                from core.embeddings import build_faiss_index as _build
                all_nodes_e = tree.all_nodes()
                node_ids_e  = [n.node_id for n in all_nodes_e if n.embedding]
                embeds      = [n.embedding for n in all_nodes_e if n.embedding]
                faiss_index = _build(node_ids_e, embeds) if node_ids_e else None

            if faiss_index is None:
                continue

            ranked = retrieve_multi_query(
                tree        = tree,
                faiss_index = faiss_index,
                all_queries = all_queries,
                top_k       = RETRIEVAL_STAGE2_TOP_K,
            )

            for nid, score in ranked:
                if nid not in global_nodes or score > global_nodes[nid][0]:
                    global_nodes[nid] = (score, doc_id, filename)

        except Exception as exc:
            logger.exception("Error searching doc_id=%s: %s", doc_id, exc)

    if not global_nodes:
        return (
            "I could not find this information in the available documents.",
            [], [],
        )

    # Sort globally by score; take top K.
    sorted_nodes = sorted(global_nodes.items(), key=lambda x: x[1][0], reverse=True)
    top_nodes    = sorted_nodes[:RETRIEVAL_STAGE2_TOP_K]
    top_node_ids = [nid for nid, _ in top_nodes]

    # Build merged context using nodes from their respective documents.
    from core.retriever import build_context as _build_ctx
    from core.tree import TreeNode

    merged_map: dict[str, TreeNode] = {}
    for nid, (score, doc_id, filename) in top_nodes:
        nm = all_node_maps.get(doc_id, {})
        if nid in nm:
            merged_map[nid] = nm[nid]
            all_sources.append(SourceCitation(
                doc_id   = doc_id,
                node_id  = nid,
                title    = nm[nid].title,
                filename = filename,
            ))

    answer = generate_answer(merged_map, top_node_ids, raw_query)
    return answer, all_sources, top_node_ids


# ── Public service function ────────────────────────────────────────────────────

async def answer_query(request: QueryRequest) -> QueryResponse:
    """
    Route and execute a user query through the full enterprise pipeline.

    Enterprise flow
    ---------------
    1.  Cache lookup  — if hit, return immediately.
    2.  Query processing — rewrite + multi-query generation.
    3.  Retrieval — beam search + hybrid score + rerank (per doc).
    4.  Multi-query fusion — merge results across query variants.
    5.  Answer generation — LLM on curated context only.
    6.  Cache store — persist for future repeated queries.
    """
    try:
        target_ids = request.doc_ids or _all_doc_ids()

        if not target_ids:
            return QueryResponse(
                status   = "success",
                answer   = "No documents have been ingested yet. Please upload a document first.",
                sources  = [],
                thinking = "",
            )

        # ── 1. Cache lookup ───────────────────────────────────────────────────
        hit = query_cache.get(request.query, doc_ids=target_ids)
        if hit:
            # Reconstruct sources from cached node_ids.
            sources: list[SourceCitation] = []
            for doc_id in hit.doc_ids:
                tree_path = TREE_DIR / f"{doc_id}.json"
                if not tree_path.exists():
                    continue
                tree     = load_tree(tree_path)
                node_map = create_node_map(tree)
                filename = _filename_for_doc(doc_id)
                for nid in hit.node_ids:
                    if nid in node_map:
                        sources.append(SourceCitation(
                            doc_id=doc_id, node_id=nid,
                            title=node_map[nid].title, filename=filename,
                        ))

            # Re-generate answer from cached nodes (fresh, no stale text).
            if sources:
                merged_map = {}
                for src in sources:
                    tree = load_tree(TREE_DIR / f"{src.doc_id}.json")
                    merged_map.update(create_node_map(tree))
                answer = generate_answer(merged_map, hit.node_ids, request.query)

                return QueryResponse(
                    status   = "success",
                    answer   = answer,
                    sources  = sources,
                    thinking = f"[Cache hit — age {hit.age_s:.0f}s] "
                               f"Query rewritten and variants generated at first call.",
                )

        # ── 2. Query processing (rewrite + multi-query) ───────────────────────
        doc_titles = get_doc_titles()
        processed  = process_query(request.query, doc_context=doc_titles)

        thinking = (
            f"Original: {processed.original}\n"
            f"Rewritten: {processed.rewritten}\n"
            f"Variants ({len(processed.variants)}): "
            + " | ".join(processed.variants)
        )

        logger.info(
            "Query processed: original=%r  queries=%d",
            request.query[:60], len(processed.all_queries),
        )

        # ── 3–5. Retrieval + answer ───────────────────────────────────────────
        if len(target_ids) == 1:
            answer, sources, node_ids = _query_one_doc(
                target_ids[0], processed.all_queries, processed.rewritten,
            )
        else:
            answer, sources, node_ids = _query_all_docs(
                target_ids, processed.all_queries, processed.rewritten,
            )

        # ── 6. Cache store ────────────────────────────────────────────────────
        if node_ids:
            query_cache.put(
                raw_query = request.query,
                node_ids  = node_ids,
                doc_ids   = list({s.doc_id for s in sources}),
            )

        logger.info(
            "Query complete: docs=%d  sources=%d  queries_used=%d",
            len(target_ids), len(sources), len(processed.all_queries),
        )

        return QueryResponse(
            status   = "success",
            answer   = answer,
            sources  = sources,
            thinking = thinking,
        )

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception("Query service error: query=%r", request.query[:60])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing your query. Please try again.",
        ) from exc
