"""
core/retriever.py — Enterprise vectorless RAG retrieval pipeline.

This module replaces the original LLM-based tree_search with a fully
deterministic, fast, multi-signal retrieval pipeline:

    Stage 1: Hierarchical beam search using FAISS embeddings
    Stage 2: Hybrid re-scoring (semantic + BM25 + metadata)
    Stage 3: Cross-encoder re-ranking (optional, high precision)
    Stage 4: Multi-query result fusion (union + score merge)
    Stage 5: Context building (dedup + merge + trim)

The LLM is NEVER called during retrieval.  It is called only once at the end
to generate the final grounded answer from the curated context.

Key design principle
--------------------
  Retrieval system = decision-maker
  LLM              = answer generator only

Public surface
--------------
  retrieve_for_query(tree, faiss_index, query_vec, query_tokens, top_k)
      → list[(node_id, score)]

  retrieve_multi_query(tree, faiss_index, processed_query)
      → list[(node_id, score)]          # fused, deduped, sorted

  generate_answer(tree, node_ids, query)
      → str
"""

from __future__ import annotations

import logging

import numpy as np

from config import (
    BEAM_TOP_K_L1,
    BEAM_TOP_K_L2,
    BEAM_TOP_K_L3,
    MAX_CONTEXT_CHARS,
    RERANKER_ENABLED,
    RERANKER_MODEL,
    RETRIEVAL_STAGE1_TOP_N,
    RETRIEVAL_STAGE2_TOP_K,
    CONTEXT_DEDUP_THRESHOLD,
)
from core.embeddings import FaissIndex, embed_text, embed_batch
from core.scorer import HybridScorer, _tokenise
from core.tree import TreeNode, create_node_map

logger = logging.getLogger(__name__)

# ── Cross-encoder singleton ────────────────────────────────────────────────────
_cross_encoder = None

def _get_cross_encoder():
    global _cross_encoder
    if _cross_encoder is None and RERANKER_ENABLED:
        try:
            from sentence_transformers import CrossEncoder
            logger.info("Loading cross-encoder: %s", RERANKER_MODEL)
            _cross_encoder = CrossEncoder(RERANKER_MODEL)
            logger.info("Cross-encoder ready.")
        except Exception as exc:
            logger.warning("Cross-encoder unavailable (%s). Stage-2 rerank disabled.", exc)
            _cross_encoder = None
    return _cross_encoder


# ── Answer generation prompt ───────────────────────────────────────────────────

_ANSWER_PROMPT = """\
You are Contexta, a precise institutional knowledge assistant.
Answer the question using ONLY the document excerpts provided below.
Do NOT use any knowledge from your training data.

Rules:
1. If the answer is present, state it concisely and factually.
2. If the answer cannot be found in the excerpts, respond with exactly:
   "I could not find this information in the available documents."
3. Do not guess. Do not apologise at length. Do not add filler phrases.
4. When the context supports an answer, cite the section title where possible.

Question: {query}

Document excerpts:
{context}

Answer:
"""


# =============================================================================
#  STAGE 1 — Hierarchical Beam Search
# =============================================================================

def _beam_search(
    root: TreeNode,
    faiss_index: FaissIndex,
    query_vec: list[float],
) -> list[str]:
    """
    Hierarchical top-K beam search over the document tree.

    Level 1 (chapters)   → keep top BEAM_TOP_K_L1
    Level 2 (sections)   → keep top BEAM_TOP_K_L2 per surviving L1
    Level 3 (subsections)→ keep top BEAM_TOP_K_L3 per surviving L2

    Nodes without embeddings fall through to FAISS global search as fallback.

    Returns
    -------
    List of node_id strings selected by beam search, unsorted.
    """
    # Build a depth map: node_id → depth (root=0, children of root=1, ...)
    depth_map: dict[str, int] = {}
    _assign_depths(root, 0, depth_map)

    # Fallback: if tree is shallow or embeddings missing, use FAISS top-N.
    all_nodes = root.all_nodes()
    embedded  = [n for n in all_nodes if n.embedding]
    if len(embedded) < 3:
        logger.info("Beam search fallback: using FAISS flat search (too few embedded nodes).")
        results = faiss_index.search(query_vec, RETRIEVAL_STAGE1_TOP_N)
        return [nid for nid, _ in results]

    # Level 1: score root's direct children.
    l1_candidates = _score_level(root.nodes, query_vec)[:BEAM_TOP_K_L1]
    if not l1_candidates:
        results = faiss_index.search(query_vec, RETRIEVAL_STAGE1_TOP_N)
        return [nid for nid, _ in results]

    selected: list[str] = []

    for l1_node, _ in l1_candidates:
        selected.append(l1_node.node_id)
        if not l1_node.nodes:
            continue
        l2_candidates = _score_level(l1_node.nodes, query_vec)[:BEAM_TOP_K_L2]
        for l2_node, _ in l2_candidates:
            selected.append(l2_node.node_id)
            if not l2_node.nodes:
                continue
            l3_candidates = _score_level(l2_node.nodes, query_vec)[:BEAM_TOP_K_L3]
            for l3_node, _ in l3_candidates:
                selected.append(l3_node.node_id)

    logger.debug("Beam search selected %d nodes.", len(selected))
    return list(set(selected))


def _assign_depths(node: TreeNode, depth: int, out: dict[str, int]) -> None:
    out[node.node_id] = depth
    for child in node.nodes:
        _assign_depths(child, depth + 1, out)


def _score_level(nodes: list[TreeNode], query_vec: list[float]) -> list[tuple[TreeNode, float]]:
    """Score a list of same-level nodes by cosine similarity with the query."""
    q = np.array(query_vec, dtype="float32")
    scored = []
    for node in nodes:
        if not node.embedding:
            scored.append((node, 0.0))
            continue
        v = np.array(node.embedding, dtype="float32")
        sim = float(np.dot(q, v))   # vectors are normalised → cosine sim
        scored.append((node, sim))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored


# =============================================================================
#  STAGE 2 — Hybrid Scoring
# =============================================================================

def _hybrid_score(
    tree:          TreeNode,
    candidate_ids: list[str],
    query_vec:     list[float],
    query_tokens:  list[str],
) -> list[tuple[str, float]]:
    """
    Re-score beam search candidates using the full hybrid scorer.

    Returns sorted (node_id, score) list.
    """
    node_map   = create_node_map(tree)
    candidates = [node_map[nid] for nid in candidate_ids if nid in node_map]

    if not candidates:
        return []

    scorer = HybridScorer.build(candidates)
    return scorer.score_all(query_vec, query_tokens)


# =============================================================================
#  STAGE 3 — Cross-Encoder Re-ranking (optional)
# =============================================================================

def _cross_encoder_rerank(
    node_map:      dict[str, TreeNode],
    scored:        list[tuple[str, float]],
    query:         str,
    top_k:         int,
) -> list[tuple[str, float]]:
    """
    Re-rank the top-N scored nodes using a cross-encoder.

    The cross-encoder reads the full (query, content) pair — more accurate than
    embedding similarity but too slow to run on all nodes.  We run it only on
    the top RETRIEVAL_STAGE1_TOP_N candidates from Stage 2.
    """
    ce = _get_cross_encoder()
    if ce is None:
        return scored[:top_k]

    candidates = scored[:RETRIEVAL_STAGE1_TOP_N]
    pairs = [
        (query, node_map[nid].content[:1500])   # truncate to keep it fast
        for nid, _ in candidates
        if nid in node_map
    ]
    if not pairs:
        return candidates[:top_k]

    try:
        ce_scores = ce.predict(pairs)
        reranked = sorted(
            zip([nid for nid, _ in candidates], ce_scores),
            key=lambda x: x[1], reverse=True,
        )
        logger.debug("Cross-encoder reranked %d → top %d.", len(candidates), top_k)
        return [(nid, float(s)) for nid, s in reranked[:top_k]]
    except Exception as exc:
        logger.warning("Cross-encoder prediction failed (%s). Falling back to hybrid scores.", exc)
        return candidates[:top_k]


# =============================================================================
#  PUBLIC: Single-Query Retrieval
# =============================================================================

def retrieve_for_query(
    tree:        TreeNode,
    faiss_index: FaissIndex,
    query_vec:   list[float],
    query:       str,
    top_k:       int = RETRIEVAL_STAGE2_TOP_K,
) -> list[tuple[str, float]]:
    """
    Full single-query retrieval pipeline.

    Steps: beam search → hybrid score → cross-encoder rerank.

    Parameters
    ----------
    tree        : Document TreeNode with embeddings populated.
    faiss_index : Pre-built FaissIndex for this document.
    query_vec   : Normalised embedding of the query string.
    query       : Raw query string (for cross-encoder).
    top_k       : Final number of nodes to return.

    Returns
    -------
    List of (node_id, score) sorted highest-first.
    """
    query_tokens = _tokenise(query)

    # Stage 1: beam search
    beam_ids = _beam_search(tree, faiss_index, query_vec)

    # Stage 2: hybrid scoring
    scored = _hybrid_score(tree, beam_ids, query_vec, query_tokens)

    # Stage 3: cross-encoder rerank
    node_map = create_node_map(tree)
    final    = _cross_encoder_rerank(node_map, scored, query, top_k)

    logger.info(
        "Retrieval: beam=%d → hybrid=%d → final=%d",
        len(beam_ids), len(scored), len(final),
    )
    return final


# =============================================================================
#  PUBLIC: Multi-Query Fusion
# =============================================================================

def retrieve_multi_query(
    tree:           TreeNode,
    faiss_index:    FaissIndex,
    all_queries:    list[str],
    top_k:          int = RETRIEVAL_STAGE2_TOP_K,
) -> list[tuple[str, float]]:
    """
    Run retrieval for every query variant and fuse results.

    Fusion strategy: for each node_id, take the MAX score across all queries
    (optimistic fusion — a node that scores high on any variant is kept).

    Parameters
    ----------
    tree         : Document TreeNode.
    faiss_index  : Pre-built FaissIndex.
    all_queries  : List of query strings [rewritten] + variants.
    top_k        : Final nodes to return after fusion.

    Returns
    -------
    Fused (node_id, score) list, sorted descending, length ≤ top_k.
    """
    if not all_queries:
        return []

    fused_scores: dict[str, float] = {}

    for query in all_queries:
        query_vec = embed_text(query)
        results   = retrieve_for_query(tree, faiss_index, query_vec, query, top_k=top_k * 2)
        for node_id, score in results:
            # Max-fusion: keep the highest score any query achieved for this node.
            if node_id not in fused_scores or score > fused_scores[node_id]:
                fused_scores[node_id] = score

    merged = sorted(fused_scores.items(), key=lambda x: x[1], reverse=True)
    logger.info(
        "Multi-query fusion: %d queries → %d unique nodes → top %d",
        len(all_queries), len(merged), top_k,
    )
    return merged[:top_k]


# =============================================================================
#  CONTEXT BUILDING
# =============================================================================

def build_context(
    node_map:  dict[str, TreeNode],
    node_ids:  list[str],
) -> str:
    """
    Build the final LLM context string from retrieved nodes.

    Steps
    -----
    1. Deduplicate: remove nodes whose content is near-duplicate of a
       higher-ranked node (cosine sim > CONTEXT_DEDUP_THRESHOLD).
    2. Remove parent nodes when their child is already included.
    3. Join and truncate to MAX_CONTEXT_CHARS.
    """
    # Collect valid nodes in ranked order.
    ordered = [node_map[nid] for nid in node_ids if nid in node_map]
    if not ordered:
        return ""

    # Dedup by embedding similarity (if embeddings present).
    kept: list[TreeNode] = []
    kept_vecs: list[np.ndarray] = []

    for node in ordered:
        if not node.embedding:
            kept.append(node)
            continue
        v = np.array(node.embedding, dtype="float32")
        duplicate = False
        for kv in kept_vecs:
            sim = float(np.dot(v, kv))
            if sim >= CONTEXT_DEDUP_THRESHOLD:
                duplicate = True
                break
        if not duplicate:
            kept.append(node)
            kept_vecs.append(v)

    # Remove parent if child already present (child is more specific).
    all_ids = {n.node_id for n in kept}
    kept_ids_set = set()
    for node in kept:
        # Check if any child of this node is already kept.
        child_ids = {c.node_id for c in node.nodes}
        if child_ids & all_ids:
            continue   # skip parent — child provides more specific context
        kept_ids_set.add(node.node_id)

    final = [n for n in kept if n.node_id in kept_ids_set] or kept

    # Join with separators; truncate to budget.
    parts = [
        f"[{node.title}]\n{node.content}"
        for node in final
    ]
    context = "\n\n---\n\n".join(parts)[:MAX_CONTEXT_CHARS]
    return context


# =============================================================================
#  ANSWER GENERATION
# =============================================================================

def generate_answer(
    node_map:  dict[str, TreeNode],
    node_ids:  list[str],
    query:     str,
) -> str:
    """
    Generate a grounded answer from the retrieved nodes.

    The LLM receives only the curated context — it never sees the tree index.
    """
    from core.llm import call_llm

    context = build_context(node_map, node_ids)
    if not context:
        return "I could not find this information in the available documents."

    prompt = _ANSWER_PROMPT.format(query=query, context=context)
    answer = call_llm(prompt)
    return answer.strip() or "I could not find this information in the available documents."