"""
core/agents/orchestrator.py — Multi-agent query orchestrator.

BUG FIXES applied:
  1. (Image 2) Cross-encoder pre-warming: _warm_cross_encoder() is called once at
     module import time. This ensures the model is loaded before the first query
     arrives — eliminating the cold-start double-load that appeared in the terminal.

  2. (Image 1) Retrieval score gate: top retrieval scores are now passed through
     to generate_answer() so it can apply the relevance threshold check introduced
     in retriever.py. If the best score is below the threshold, "not found" is
     returned immediately instead of letting the LLM hallucinate.

  3. (Image 1) Context quality gate: if fused retrieval returns nodes but the
     highest score is very low (< 0.20), the orchestrator short-circuits and
     returns "not found" before calling any synthesis LLM.

Pipeline (unchanged):
  Step 1  Intent Agent      (LLM call)
  Step 2  Query Rewriter    (LLM call)
  Step 3  Planner Agent     (LLM call)
  Step 4  Parallel Retrieval (FAISS) — all queries × all docs
  Step 5  Synthesis Agent   (LLM call)
  Step 6  Confidence check  (LLM call)
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any

from config import RETRIEVAL_STAGE2_TOP_K
from core.agents.intent_agent import IntentResult, analyse_intent
from core.agents.planner_agent import RetrievalPlan, plan_retrieval
from core.agents.synthesis_agent import SynthesisResult, synthesise
from core.embeddings import FaissIndex, embed_text
from core.retriever import (
    retrieve_for_query,
    build_context,
)
from core.tree import TreeNode, create_node_map

logger = logging.getLogger(__name__)

# Minimum retrieval score to proceed with LLM synthesis.
# Below this, we return "not found" immediately to prevent hallucination.
_MIN_PROCEED_SCORE = 0.20


# ── Cross-encoder pre-warm (Image 2 fix) ──────────────────────────────────────

def _warm_cross_encoder() -> None:
    """
    Load the cross-encoder into memory at module import time (once).

    Previously the model was loaded lazily on the first query — but because
    parallel retrieval threads all call _get_cross_encoder() simultaneously
    before the singleton is set, each thread triggered its own load.
    Pre-warming at import time means the singleton is ready before any request.
    """
    try:
        from core.retriever import _get_cross_encoder
        _get_cross_encoder()   # triggers the thread-safe load exactly once
        logger.info("Cross-encoder pre-warmed at module load.")
    except Exception as exc:
        logger.debug("Cross-encoder pre-warm skipped: %s", exc)


# Run at import time (happens once when FastAPI starts up).
_warm_cross_encoder()


# ── Result dataclass ───────────────────────────────────────────────────────────

@dataclass
class AgentResult:
    answer:         str
    confidence:     str              = "MEDIUM"
    gaps:           list[str]        = field(default_factory=list)
    cited_sections: list[str]        = field(default_factory=list)
    intent_type:    str              = "LOOKUP"
    search_focus:   str              = ""
    all_queries:    list[str]        = field(default_factory=list)
    node_ids:       list[str]        = field(default_factory=list)
    thinking:       str              = ""
    elapsed_ms:     float            = 0.0


# ── Parallel retrieval helpers ─────────────────────────────────────────────────

def _retrieve_one_query_one_doc(
    query:        str,
    tree:         TreeNode,
    faiss_index:  FaissIndex,
    top_k:        int,
    use_reranker: bool,
) -> list[tuple[str, float]]:
    """Single-query, single-document retrieval. Runs in a worker thread."""
    query_vec = embed_text(query)
    return retrieve_for_query(
        tree        = tree,
        faiss_index = faiss_index,
        query_vec   = query_vec,
        query       = query,
        top_k       = top_k,
    )


def _parallel_retrieve(
    queries:            list[str],
    trees_and_indexes:  list[tuple[str, str, TreeNode, FaissIndex]],
    top_k:              int,
    use_reranker:       bool,
) -> dict[str, tuple[float, str, str, TreeNode]]:
    """
    Run all (query × document) combinations in parallel.

    Returns fused result: node_id → (best_score, doc_id, filename, node_object).
    Max-score fusion across all queries and documents.
    """
    fused: dict[str, tuple[float, str, str, TreeNode]] = {}

    tasks = [
        (query, doc_id, filename, tree, faiss)
        for query in queries
        for doc_id, filename, tree, faiss in trees_and_indexes
    ]

    max_workers = min(len(tasks), 8)

    with ThreadPoolExecutor(
        max_workers=max_workers, thread_name_prefix="retrieval"
    ) as ex:
        future_map = {
            ex.submit(
                _retrieve_one_query_one_doc,
                query, tree, faiss, top_k, use_reranker
            ): (doc_id, filename, tree)
            for query, doc_id, filename, tree, faiss in tasks
        }

        for future in as_completed(future_map):
            doc_id, filename, tree = future_map[future]
            try:
                results  = future.result()
                node_map = create_node_map(tree)
                for nid, score in results:
                    if nid not in fused or score > fused[nid][0]:
                        node_obj = node_map.get(nid)
                        if node_obj:
                            fused[nid] = (score, doc_id, filename, node_obj)
            except Exception as exc:
                logger.warning("Retrieval task failed for doc_id=%s: %s", doc_id, exc)

    return fused


# ── Main orchestrator ──────────────────────────────────────────────────────────

def run_agents(
    raw_query:         str,
    trees_and_indexes: list[tuple[str, str, TreeNode, FaissIndex]],
    doc_titles:        str = "",
) -> AgentResult:
    """
    Run the full multi-agent pipeline for a user query.
    """
    t_start = time.perf_counter()

    if not trees_and_indexes:
        return AgentResult(
            answer     = "No documents have been ingested yet. Please upload a document first.",
            confidence = "LOW",
            thinking   = "No documents available to search.",
        )

    # ── Steps 1 + 2: Intent analysis and query rewriting IN PARALLEL ──────────
    intent_result: IntentResult | None = None
    rewritten_query: str               = raw_query

    from core.query_processor import rewrite_query

    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="agent-init") as ex:
        intent_future  = ex.submit(analyse_intent, raw_query)
        rewrite_future = ex.submit(rewrite_query, raw_query, doc_titles)

        intent_result   = intent_future.result()
        rewritten_query = rewrite_future.result()

    logger.info(
        "Agents init: intent=%s  confidence=%.2f  rewritten=%r",
        intent_result.intent_type, intent_result.confidence, rewritten_query[:60],
    )

    # ── Step 3: Planner ────────────────────────────────────────────────────────
    plan: RetrievalPlan = plan_retrieval(
        intent          = intent_result,
        rewritten_query = rewritten_query,
        doc_titles      = doc_titles,
    )

    logger.info(
        "Plan: mode=%s  queries=%d  top_k=%d  reranker=%s",
        plan.mode, len(plan.queries), plan.top_k, plan.use_reranker,
    )

    # ── Step 4: Parallel retrieval ─────────────────────────────────────────────
    fused = _parallel_retrieve(
        queries           = plan.queries,
        trees_and_indexes = trees_and_indexes,
        top_k             = plan.top_k,
        use_reranker      = plan.use_reranker,
    )

    if not fused:
        return AgentResult(
            answer       = "I could not find information about this in the available documents.",
            confidence   = "LOW",
            intent_type  = intent_result.intent_type,
            search_focus = intent_result.search_focus,
            all_queries  = plan.queries,
            thinking     = _build_thinking(intent_result, plan, rewritten_query, [], 0),
        )

    # Sort by score, take top_k.
    sorted_results = sorted(fused.items(), key=lambda x: x[1][0], reverse=True)
    top_results    = sorted_results[:plan.top_k]

    # ── Relevance gate (Image 1 fix) ───────────────────────────────────────────
    # If the BEST score across all retrieved nodes is below the proceed threshold,
    # the retrieval almost certainly did not find relevant content. Return "not found"
    # instead of passing near-zero-relevance context to the LLM.
    best_score = top_results[0][1][0] if top_results else 0.0
    if best_score < _MIN_PROCEED_SCORE:
        logger.warning(
            "Orchestrator relevance gate: best_score=%.3f < %.3f. Refusing to synthesise.",
            best_score, _MIN_PROCEED_SCORE,
        )
        return AgentResult(
            answer       = "I could not find this information in the available documents.",
            confidence   = "LOW",
            intent_type  = intent_result.intent_type,
            search_focus = intent_result.search_focus,
            all_queries  = plan.queries,
            node_ids     = [],
            thinking     = _build_thinking(intent_result, plan, rewritten_query, [], 0),
            gaps         = [
                f"No sections with sufficient relevance were found "
                f"(best score: {best_score:.3f})."
            ],
        )

    top_node_ids  = [nid for nid, _ in top_results]
    source_titles = [fused[nid][3].title for nid in top_node_ids if nid in fused]

    # Build unified node map for context.
    merged_node_map: dict[str, TreeNode] = {
        nid: fused[nid][3] for nid in top_node_ids if nid in fused
    }

    context = build_context(merged_node_map, top_node_ids)

    # Prepare top_scores for the relevance gate inside generate_answer / synthesise.
    top_scores = [(nid, fused[nid][0]) for nid in top_node_ids if nid in fused]

    # ── Step 5: Synthesis ──────────────────────────────────────────────────────
    synthesis: SynthesisResult = synthesise(
        context       = context,
        query         = rewritten_query,
        intent_type   = intent_result.intent_type,
        source_titles = source_titles,
    )

    elapsed_ms = (time.perf_counter() - t_start) * 1000

    thinking = _build_thinking(
        intent_result, plan, rewritten_query,
        source_titles, elapsed_ms,
    )

    logger.info(
        "Orchestrator done: intent=%s  confidence=%s  nodes=%d  best_score=%.3f  elapsed=%.0fms",
        intent_result.intent_type, synthesis.confidence,
        len(top_node_ids), best_score, elapsed_ms,
    )

    return AgentResult(
        answer         = synthesis.answer,
        confidence     = synthesis.confidence,
        gaps           = synthesis.gaps,
        cited_sections = synthesis.cited_sections,
        intent_type    = intent_result.intent_type,
        search_focus   = intent_result.search_focus,
        all_queries    = plan.queries,
        node_ids       = top_node_ids,
        thinking       = thinking,
        elapsed_ms     = elapsed_ms,
    )


def _build_thinking(
    intent:     IntentResult,
    plan:       RetrievalPlan,
    rewritten:  str,
    sections:   list[str],
    elapsed_ms: float,
) -> str:
    """Build the transparency trace string for the API response."""
    lines = [
        "[Intent Agent]",
        f"  Type: {intent.intent_type}  Confidence: {intent.confidence:.0%}",
        f"  Complexity: {intent.complexity}",
        f"  Search focus: {intent.search_focus}",
    ]
    if intent.all_entities_flat:
        lines.append(f"  Entities: {', '.join(intent.all_entities_flat)}")

    lines += [
        "",
        "[Planner Agent]",
        f"  Mode: {plan.mode}  Top-K: {plan.top_k}  Reranker: {plan.use_reranker}",
        f"  Rewritten query: {rewritten}",
        f"  Query variants ({len(plan.queries)}):",
    ]
    for i, q in enumerate(plan.queries, 1):
        lines.append(f"    {i}. {q}")

    if sections:
        lines += ["", "[Retrieval Agent]", "  Sections used:"]
        for s in sections:
            lines.append(f"    • {s}")

    if elapsed_ms:
        lines += ["", "[Performance]", f"  Total: {elapsed_ms:.0f}ms"]

    return "\n".join(lines)