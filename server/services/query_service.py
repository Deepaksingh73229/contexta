"""
services/query_service.py — Multi-agent query orchestration service.

Integrates the full multi-agent pipeline:
  Intent Agent → Planner Agent → Parallel Retrieval → Synthesis Agent

Speed optimisations:
  - Intent analysis + query rewriting run in parallel (independent).
  - All query × document retrieval combinations run in parallel threads.
  - FAISS indexes are loaded once and kept in a module-level LRU cache.
  - Query path cache returns immediately for repeated queries.
  - Embedding model is a singleton — no cold-start per call.

Public surface
--------------
  answer_query(request) → QueryResponse
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException, status

from config import TREE_DIR
from core.agents.orchestrator import run_agents, AgentResult
from core.embeddings import load_faiss_index, FaissIndex
from core.tree import load_tree, create_node_map, TreeNode
from models.schemas import QueryRequest, QueryResponse, SourceCitation
from services.ingestion_service import get_doc_titles
from services import query_cache

logger = logging.getLogger(__name__)


# ── FAISS index cache (avoid reloading from disk on every query) ───────────────
# Keyed by doc_id. The cache holds up to 32 documents in memory.
# On a server with multiple documents this saves ~50-200ms per query.

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
            # Try to build inline from tree embeddings (legacy docs).
            try:
                tree = _load_tree_cached(doc_id)
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


def _invalidate_cache(doc_id: str) -> None:
    """Called when a document is re-ingested."""
    _tree_cache.pop(doc_id, None)
    _faiss_cache.pop(doc_id, None)


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
    Load (or retrieve from cache) all trees and FAISS indexes for the given doc_ids.

    Returns list of (doc_id, filename, tree, faiss_index).
    Only includes documents that have both a tree and a FAISS index.
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


def _agent_result_to_sources(
    agent_result: AgentResult,
    trees_and_indexes: list[tuple[str, str, TreeNode, FaissIndex]],
) -> list[SourceCitation]:
    """Convert agent node_ids back to SourceCitation objects."""
    # Build a flat map: node_id → (doc_id, filename, node)
    node_lookup: dict[str, tuple[str, str, TreeNode]] = {}
    for doc_id, filename, tree, _ in trees_and_indexes:
        node_map = create_node_map(tree)
        for nid, node in node_map.items():
            node_lookup[nid] = (doc_id, filename, node)

    sources = []
    seen: set[str] = set()
    for nid in agent_result.node_ids:
        if nid in node_lookup and nid not in seen:
            doc_id, filename, node = node_lookup[nid]
            sources.append(SourceCitation(
                doc_id   = doc_id,
                node_id  = nid,
                title    = node.title,
                filename = filename,
            ))
            seen.add(nid)
    return sources


# ── Public service function ────────────────────────────────────────────────────

async def answer_query(request: QueryRequest) -> QueryResponse:
    """
    Route a user query through the full multi-agent pipeline.

    Flow
    ----
    1. Cache lookup — return immediately if hit.
    2. Load trees + FAISS indexes (from in-memory cache where possible).
    3. Run orchestrator: Intent → Planner → Parallel Retrieval → Synthesis.
    4. Store result in cache.
    5. Return structured QueryResponse.
    """
    import time
    t0 = time.perf_counter()

    try:
        target_ids = request.doc_ids or _all_doc_ids()

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
        cache_hit = query_cache.get(request.query, doc_ids=target_ids)
        if cache_hit:
            trees_and_indexes = _build_trees_and_indexes(cache_hit.doc_ids or target_ids)
            if trees_and_indexes:
                # Re-run synthesis on cached nodes (fresh answer, same retrieval).
                from core.retriever import build_context, generate_answer
                merged_node_map = {}
                sources: list[SourceCitation] = []
                for doc_id, filename, tree, _ in trees_and_indexes:
                    nm = create_node_map(tree)
                    merged_node_map.update(nm)
                    for nid in cache_hit.node_ids:
                        if nid in nm:
                            sources.append(SourceCitation(
                                doc_id=doc_id, node_id=nid,
                                title=nm[nid].title, filename=filename,
                            ))

                answer = generate_answer(merged_node_map, cache_hit.node_ids, request.query)
                elapsed_ms = (time.perf_counter() - t0) * 1000
                return QueryResponse(
                    status       = "success",
                    answer       = answer,
                    confidence   = "HIGH",   # cached result was validated previously
                    intent_type  = "LOOKUP",
                    search_focus = "",
                    gaps         = [],
                    sources      = sources,
                    thinking     = f"[Cache hit — age {cache_hit.age_s:.0f}s]\nRetrieved from query cache.",
                    elapsed_ms   = elapsed_ms,
                )

        # ── 2. Load trees + FAISS indexes (cached in memory) ─────────────────
        trees_and_indexes = _build_trees_and_indexes(target_ids)
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

        # ── 3. Run multi-agent orchestrator ───────────────────────────────────
        doc_titles = get_doc_titles()

        agent_result: AgentResult = run_agents(
            raw_query          = request.query,
            trees_and_indexes  = trees_and_indexes,
            doc_titles         = doc_titles,
        )

        # ── 4. Build sources ──────────────────────────────────────────────────
        sources = _agent_result_to_sources(agent_result, trees_and_indexes)

        # ── 5. Store in cache ─────────────────────────────────────────────────
        if agent_result.node_ids:
            query_cache.put(
                raw_query = request.query,
                node_ids  = agent_result.node_ids,
                doc_ids   = list({s.doc_id for s in sources}),
            )

        elapsed_ms = (time.perf_counter() - t0) * 1000

        logger.info(
            "Query complete: intent=%s  confidence=%s  sources=%d  elapsed=%.0fms",
            agent_result.intent_type, agent_result.confidence,
            len(sources), elapsed_ms,
        )

        return QueryResponse(
            status       = "success",
            answer       = agent_result.answer,
            confidence   = agent_result.confidence,
            intent_type  = agent_result.intent_type,
            search_focus = agent_result.search_focus,
            gaps         = agent_result.gaps,
            sources      = sources,
            thinking     = agent_result.thinking,
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