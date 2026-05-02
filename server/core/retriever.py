"""
core/retriever.py — Enterprise vectorless RAG retrieval pipeline.

Fixes applied:
  - BUG FIX (Image 2): Cross-encoder singleton now uses a threading.Lock to prevent
    concurrent threads from each loading the model simultaneously. Previously, parallel
    retrieval workers all saw _cross_encoder=None at the same time and each triggered
    a HuggingFace download/load — causing 2–4x duplicate loads per query.
  - BUG FIX (Image 1): generate_answer() and build_context() hardened against
    out-of-context answers. Added a strict pre-check that aborts if context is thin.
"""

from __future__ import annotations

import logging
import threading

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

# ── Cross-encoder singleton — thread-safe ──────────────────────────────────────
# BUG FIX (Image 2): The original code had no lock around the singleton init.
# With SUMMARISE_WORKERS=3 and parallel retrieval, multiple threads simultaneously
# saw _cross_encoder=None and each triggered a full model load from disk/HuggingFace.
# This explains the duplicate "Loading weights: 100%" lines in the terminal.
# Solution: a threading.Lock ensures only ONE thread loads the model.

_cross_encoder = None
_cross_encoder_lock = threading.Lock()


def _get_cross_encoder():
    global _cross_encoder
    # Fast path: model already loaded, no lock needed.
    if _cross_encoder is not None:
        return _cross_encoder

    # Slow path: acquire lock so only ONE thread loads the model.
    with _cross_encoder_lock:
        # Double-checked locking: another thread may have loaded it while we waited.
        if _cross_encoder is not None:
            return _cross_encoder

        if not RERANKER_ENABLED:
            return None

        try:
            from sentence_transformers import CrossEncoder
            logger.info("Loading cross-encoder (once): %s", RERANKER_MODEL)
            _cross_encoder = CrossEncoder(RERANKER_MODEL)
            logger.info("Cross-encoder ready and cached in memory.")
        except Exception as exc:
            logger.warning(
                "Cross-encoder unavailable (%s). Stage-3 rerank disabled.", exc
            )
            _cross_encoder = None

    return _cross_encoder


# ── Answer generation prompt ───────────────────────────────────────────────────
# BUG FIX (Image 1): Strengthened the grounding rules. The previous prompt allowed
# the LLM too much freedom. Added:
#   - Explicit "STOP" instruction if context is insufficient.
#   - Prohibition on combining retrieved facts with training knowledge.
#   - Requirement to quote section titles for every specific claim.

_ANSWER_PROMPT = """\
You are Contexta, a precise institutional knowledge assistant.

CRITICAL RULES — FOLLOW EXACTLY:
1. Answer using ONLY the document excerpts provided below. Nothing else.
2. Do NOT use any knowledge from your training data — not even to fill gaps.
3. If the answer is NOT present in the excerpts, you MUST respond with exactly:
   "I could not find this information in the available documents."
4. Do NOT combine retrieved facts with assumed or inferred information.
5. Do NOT guess, extrapolate, or paraphrase beyond what the text explicitly states.
6. For every specific claim, cite the section: (→ Section Title).
7. No filler phrases. No apologies. No preamble like "Based on the documents...".
8. If the excerpts are only partially relevant, state only what IS confirmed, then
   say: "The documents do not contain further details on this topic."

Question: {query}

Document excerpts:
{context}

Answer (grounded strictly in the excerpts above):
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

    Level 1 (chapters)    → keep top BEAM_TOP_K_L1
    Level 2 (sections)    → keep top BEAM_TOP_K_L2 per surviving L1
    Level 3 (subsections) → keep top BEAM_TOP_K_L3 per surviving L2

    Returns list of node_id strings, unsorted.
    """
    depth_map: dict[str, int] = {}
    _assign_depths(root, 0, depth_map)

    all_nodes = root.all_nodes()
    embedded  = [n for n in all_nodes if n.embedding]

    if len(embedded) < 3:
        logger.info("Beam search fallback: FAISS flat search (too few embedded nodes).")
        results = faiss_index.search(query_vec, RETRIEVAL_STAGE1_TOP_N)
        return [nid for nid, _ in results]

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
        sim = float(np.dot(q, v))
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
    """Re-score beam search candidates using the full hybrid scorer."""
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

    Thread-safe: _get_cross_encoder() uses a lock so the model is loaded once.
    """
    ce = _get_cross_encoder()
    if ce is None:
        return scored[:top_k]

    candidates = scored[:RETRIEVAL_STAGE1_TOP_N]
    pairs = [
        (query, node_map[nid].content[:1500])
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
        logger.warning("Cross-encoder prediction failed (%s). Falling back.", exc)
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
    """
    query_tokens = _tokenise(query)

    beam_ids = _beam_search(tree, faiss_index, query_vec)
    scored   = _hybrid_score(tree, beam_ids, query_vec, query_tokens)
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
    Run retrieval for every query variant and fuse results (max-score union).
    """
    if not all_queries:
        return []

    fused_scores: dict[str, float] = {}

    for query in all_queries:
        query_vec = embed_text(query)
        results   = retrieve_for_query(tree, faiss_index, query_vec, query, top_k=top_k * 2)
        for node_id, score in results:
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

# Minimum content quality threshold: if total context is very short,
# we warn and let the synthesis agent return a "not found" answer.
_MIN_USEFUL_CONTEXT_CHARS = 100


def build_context(
    node_map:  dict[str, TreeNode],
    node_ids:  list[str],
) -> str:
    """
    Build the final LLM context string from retrieved nodes.

    Steps:
    1. Deduplicate by embedding similarity (> CONTEXT_DEDUP_THRESHOLD).
    2. Remove parent nodes when their child is already included.
    3. Join and truncate to MAX_CONTEXT_CHARS.
    """
    ordered = [node_map[nid] for nid in node_ids if nid in node_map]
    if not ordered:
        return ""

    # Dedup by embedding similarity.
    kept: list[TreeNode] = []
    kept_vecs: list[np.ndarray] = []

    for node in ordered:
        if not node.embedding:
            kept.append(node)
            continue
        v = np.array(node.embedding, dtype="float32")
        duplicate = any(
            float(np.dot(v, kv)) >= CONTEXT_DEDUP_THRESHOLD
            for kv in kept_vecs
        )
        if not duplicate:
            kept.append(node)
            kept_vecs.append(v)

    # Remove parent if child already present.
    all_ids = {n.node_id for n in kept}
    kept_ids_set: set[str] = set()
    for node in kept:
        child_ids = {c.node_id for c in node.nodes}
        if child_ids & all_ids:
            continue
        kept_ids_set.add(node.node_id)

    final = [n for n in kept if n.node_id in kept_ids_set] or kept

    parts = [
        f"[{node.title}]\n{node.content}"
        for node in final
    ]
    context = "\n\n---\n\n".join(parts)[:MAX_CONTEXT_CHARS]

    if len(context.strip()) < _MIN_USEFUL_CONTEXT_CHARS:
        logger.warning(
            "build_context: very thin context (%d chars) for %d nodes — "
            "retrieval may have returned low-quality results.",
            len(context.strip()), len(node_ids),
        )

    return context


# =============================================================================
#  ANSWER GENERATION
# =============================================================================

# Minimum cosine similarity threshold: if the top retrieved node scores below
# this against the query embedding, the context is likely irrelevant and we
# should refuse to answer rather than hallucinate.
_MIN_RETRIEVAL_SCORE_THRESHOLD = 0.25


def generate_answer(
    node_map:  dict[str, TreeNode],
    node_ids:  list[str],
    query:     str,
    top_scores: list[tuple[str, float]] | None = None,
) -> str:
    """
    Generate a grounded answer from the retrieved nodes.

    BUG FIX (Image 1): Added relevance gate — if retrieval scores are all very low,
    we return "not found" immediately without calling the LLM, preventing the model
    from filling the gap with training-data hallucinations.

    Parameters
    ----------
    node_map   : node_id → TreeNode lookup for all available nodes.
    node_ids   : Ordered list of retrieved node IDs (highest relevance first).
    query      : Raw query string.
    top_scores : Optional (node_id, score) pairs from retrieval — used to gate
                 on relevance before calling the LLM.
    """
    from core.llm import call_llm

    # Relevance gate: if the best retrieval score is too low, the context is
    # likely off-topic — don't let the LLM fill in from its training data.
    if top_scores:
        best_score = max(s for _, s in top_scores) if top_scores else 0.0
        if best_score < _MIN_RETRIEVAL_SCORE_THRESHOLD:
            logger.warning(
                "Relevance gate triggered: best retrieval score %.3f < threshold %.3f. "
                "Returning 'not found' to prevent hallucination.",
                best_score, _MIN_RETRIEVAL_SCORE_THRESHOLD,
            )
            return "I could not find this information in the available documents."

    context = build_context(node_map, node_ids)
    if not context or len(context.strip()) < _MIN_USEFUL_CONTEXT_CHARS:
        return "I could not find this information in the available documents."

    prompt = _ANSWER_PROMPT.format(query=query, context=context)
    answer = call_llm(prompt)
    return answer.strip() or "I could not find this information in the available documents."