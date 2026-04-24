"""
core/agents/orchestrator.py — Multi-agent query orchestrator.

The Orchestrator coordinates all agents in the pipeline and manages
parallel execution for maximum response speed.

Pipeline
--------
  Step 1  Intent Agent      — classify query, extract entities          (LLM call)
  Step 2  Query Rewriter    — rewrite for retrieval precision            (LLM call)
  Step 3  Planner Agent     — decide retrieval strategy + query variants (LLM call)
  ─── Steps 1-3 run sequentially (each depends on the previous) ────────────────
  Step 4  Parallel Retrieval — all query variants run simultaneously     (FAISS)
  ─── Step 4 is parallelised across queries AND documents ─────────────────────
  Step 5  Synthesis Agent   — intent-aware answer generation             (LLM call)
  Step 6  Confidence check  — lightweight evidence quality evaluation    (LLM call)
  ─── Steps 5-6 run in parallel (independent of each other) ──────────────────

Speed optimisations
-------------------
1. Steps 1 + 2 (Intent + Rewrite) run in PARALLEL — they are independent.
2. All query variant retrievals run in PARALLEL via ThreadPoolExecutor.
3. All document retrievals for each query run in PARALLEL.
4. The confidence evaluation runs while the answer is being post-processed.
5. FAISS embed_text() calls are batched where possible.
6. The embedding model is a singleton — no cold-start per call.

Public surface
--------------
  AgentResult    — full structured result from the multi-agent pipeline
  run_agents(query, doc_ids, doc_titles, trees_and_indexes) → AgentResult
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


# ── Result dataclass ───────────────────────────────────────────────────────────

@dataclass
class AgentResult:
    """
    Full structured result from the multi-agent pipeline.

    Fields
    ------
    answer          : Final answer text (from Synthesis Agent).
    confidence      : HIGH | MEDIUM | LOW (from Synthesis Agent).
    gaps            : Topics the context did not cover.
    cited_sections  : Section titles used to generate the answer.
    intent_type     : Classified intent (for frontend display).
    search_focus    : What the agents were searching for.
    all_queries     : All query variants that were executed.
    node_ids        : Ordered list of retrieved node IDs.
    thinking        : Full agent reasoning trace (for transparency).
    elapsed_ms      : Total wall-clock time in milliseconds.
    """
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
    query:       str,
    tree:        TreeNode,
    faiss_index: FaissIndex,
    top_k:       int,
    use_reranker: bool,
) -> list[tuple[str, float]]:
    """
    Single-query, single-document retrieval.
    Runs in a worker thread.
    """
    query_vec = embed_text(query)
    return retrieve_for_query(
        tree        = tree,
        faiss_index = faiss_index,
        query_vec   = query_vec,
        query       = query,
        top_k       = top_k,
    )


def _parallel_retrieve(
    queries:             list[str],
    trees_and_indexes:   list[tuple[str, str, TreeNode, FaissIndex]],  # (doc_id, filename, tree, faiss)
    top_k:               int,
    use_reranker:        bool,
) -> dict[str, tuple[float, str, str, "TreeNode"]]:
    """
    Run all (query × document) combinations in parallel using a ThreadPoolExecutor.

    Returns
    -------
    Fused result: node_id → (best_score, doc_id, filename, node_object)
    Max-score fusion across all queries and documents.
    """
    fused: dict[str, tuple[float, str, str, TreeNode]] = {}

    # Build all tasks: (query, doc_id, filename, tree, faiss_index)
    tasks = [
        (query, doc_id, filename, tree, faiss)
        for query in queries
        for doc_id, filename, tree, faiss in trees_and_indexes
    ]

    max_workers = min(len(tasks), 8)   # cap at 8 threads to avoid Ollama overload

    with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="retrieval") as ex:
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
                results = future.result()
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
    raw_query:          str,
    trees_and_indexes:  list[tuple[str, str, TreeNode, FaissIndex]],
    doc_titles:         str = "",
) -> AgentResult:
    """
    Run the full multi-agent pipeline for a user query.

    Parameters
    ----------
    raw_query          : The user's original question.
    trees_and_indexes  : List of (doc_id, filename, TreeNode, FaissIndex) tuples.
                         One entry per document to search.
    doc_titles         : Comma-separated list of document filenames (for rewriting).

    Returns
    -------
    AgentResult with structured answer, confidence, and full transparency trace.
    """
    t_start = time.perf_counter()

    if not trees_and_indexes:
        return AgentResult(
            answer     = "No documents have been ingested yet. Please upload a document first.",
            confidence = "LOW",
            thinking   = "No documents available to search.",
        )

    # ── Steps 1 + 2: Intent analysis and query rewriting IN PARALLEL ──────────
    # These are independent — both can run simultaneously.
    intent_result: IntentResult | None = None
    rewritten_query: str               = raw_query

    from core.query_processor import rewrite_query

    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="agent-init") as ex:
        intent_future  = ex.submit(analyse_intent, raw_query)
        rewrite_future = ex.submit(rewrite_query, raw_query, doc_titles)

        intent_result    = intent_future.result()
        rewritten_query  = rewrite_future.result()

    logger.info(
        "Agents init: intent=%s  confidence=%.2f  rewritten=%r",
        intent_result.intent_type, intent_result.confidence, rewritten_query[:60],
    )

    # ── Step 3: Planner — decide strategy and generate query variants ──────────
    plan: RetrievalPlan = plan_retrieval(
        intent          = intent_result,
        rewritten_query = rewritten_query,
        doc_titles      = doc_titles,
    )

    logger.info(
        "Plan: mode=%s  queries=%d  top_k=%d  reranker=%s",
        plan.mode, len(plan.queries), plan.top_k, plan.use_reranker,
    )

    # ── Step 4: Parallel retrieval across all queries × all documents ──────────
    fused = _parallel_retrieve(
        queries            = plan.queries,
        trees_and_indexes  = trees_and_indexes,
        top_k              = plan.top_k,
        use_reranker       = plan.use_reranker,
    )

    if not fused:
        return AgentResult(
            answer      = "I could not find information about this in the available documents.",
            confidence  = "LOW",
            intent_type = intent_result.intent_type,
            search_focus = intent_result.search_focus,
            all_queries  = plan.queries,
            thinking    = _build_thinking(intent_result, plan, rewritten_query, [], 0),
        )

    # ── Sort fused results by score, take top_k ───────────────────────────────
    sorted_results = sorted(fused.items(), key=lambda x: x[1][0], reverse=True)
    top_results    = sorted_results[:plan.top_k]

    top_node_ids   = [nid for nid, _ in top_results]
    source_titles  = [fused[nid][3].title for nid in top_node_ids if nid in fused]

    # Build unified node map for context building.
    merged_node_map: dict[str, TreeNode] = {
        nid: fused[nid][3] for nid in top_node_ids if nid in fused
    }

    context = build_context(merged_node_map, top_node_ids)

    # ── Step 5: Synthesis — intent-aware answer generation ────────────────────
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
        "Orchestrator done: intent=%s  confidence=%s  nodes=%d  elapsed=%.0fms",
        intent_result.intent_type, synthesis.confidence, len(top_node_ids), elapsed_ms,
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
    intent:         IntentResult,
    plan:           RetrievalPlan,
    rewritten:      str,
    sections:       list[str],
    elapsed_ms:     float,
) -> str:
    """Build the transparency trace string for the API response."""
    lines = [
        f"[Intent Agent]",
        f"  Type: {intent.intent_type}  Confidence: {intent.confidence:.0%}",
        f"  Complexity: {intent.complexity}",
        f"  Search focus: {intent.search_focus}",
    ]
    if intent.all_entities_flat:
        lines.append(f"  Entities: {', '.join(intent.all_entities_flat)}")

    lines += [
        f"",
        f"[Planner Agent]",
        f"  Mode: {plan.mode}  Top-K: {plan.top_k}  Reranker: {plan.use_reranker}",
        f"  Rewritten query: {rewritten}",
        f"  Query variants ({len(plan.queries)}):",
    ]
    for i, q in enumerate(plan.queries, 1):
        lines.append(f"    {i}. {q}")

    if sections:
        lines += ["", f"[Retrieval Agent]", f"  Sections used:"]
        for s in sections:
            lines.append(f"    • {s}")

    if elapsed_ms:
        lines += ["", f"[Performance]", f"  Total: {elapsed_ms:.0f}ms"]

    return "\n".join(lines)