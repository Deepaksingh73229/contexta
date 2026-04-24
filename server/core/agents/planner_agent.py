"""
core/agents/planner_agent.py — Retrieval strategy planner.

The Planner Agent is the SECOND agent in the pipeline.
It takes the IntentResult from the Intent Agent and decides:

  1. How many query variants to generate (based on complexity)
  2. What retrieval mode to use (single-shot vs multi-query vs exhaustive)
  3. How many nodes to retrieve (top_k)
  4. Whether to use the cross-encoder reranker
  5. Whether to search all documents or only the most relevant ones
  6. The final set of search queries optimised for this specific intent type

Intent-specific query generation strategy
------------------------------------------
Different intents need different query phrasings to retrieve well:

  DEFINITION      → "What is [topic]?", "Define [topic]", "[topic] meaning"
  PROCEDURE       → "Steps to [topic]", "How to [topic] procedure", "process for [topic]"
  LOOKUP          → Precise factual phrasing, include entity names exactly
  COMPARISON      → One query per entity being compared, plus one joint query
  SUMMARISE       → "[topic] overview", "summary of [topic]", "[topic] key points"
  EXISTENCE_CHECK → "Is there [topic]", "[topic] policy exists", "[topic] allowed"
  PERSON_LOOKUP   → "Who is responsible for [topic]", "[topic] author approved by"
  DATE_LOOKUP     → "When [topic] date", "[topic] deadline timeline schedule"

Public surface
--------------
  RetrievalPlan   — dataclass describing the full retrieval strategy
  plan_retrieval(intent, rewritten_query, doc_titles) → RetrievalPlan
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from config import (
    MULTI_QUERY_COUNT,
    RETRIEVAL_STAGE1_TOP_N,
    RETRIEVAL_STAGE2_TOP_K,
    RERANKER_ENABLED,
)
from core.agents.intent_agent import IntentResult
from core.llm import call_llm, parse_json_response

logger = logging.getLogger(__name__)


# ── Plan dataclass ─────────────────────────────────────────────────────────────

@dataclass
class RetrievalPlan:
    """
    Complete retrieval strategy for one user query.

    Attributes
    ----------
    queries        : List of search queries to run (primary + variants).
    top_k          : Number of nodes to retrieve per query.
    use_reranker   : Whether to use cross-encoder reranking.
    search_all_docs: If True, search every ingested document.
    mode           : "single" | "multi" | "exhaustive"
    intent_type    : Passed through for the synthesis agent.
    complexity     : Passed through for context window sizing.
    """
    queries:         list[str]
    top_k:           int        = RETRIEVAL_STAGE2_TOP_K
    use_reranker:    bool       = True
    search_all_docs: bool       = True
    mode:            str        = "multi"
    intent_type:     str        = "LOOKUP"
    complexity:      str        = "simple"


# ── Intent-specific query templates ───────────────────────────────────────────

_PLANNER_PROMPT = """\
You are the Search Strategy Agent for an institutional document retrieval system.

You have already classified the user's intent. Now generate the optimal set of
search queries to find the best answer in the document database.

USER QUERY: {query}
INTENT TYPE: {intent_type}
SEARCH FOCUS: {search_focus}
EXTRACTED TOPICS: {topics}
EXTRACTED ENTITIES: {entities}

RULES FOR QUERY GENERATION:
1. Generate exactly {n} search queries, each targeting the same information from a different angle.
2. Tailor phrasing to the intent type:
   - DEFINITION queries: use "what is", "definition of", "meaning of", "describe"
   - PROCEDURE queries: use "steps to", "how to", "process for", "procedure", "method"
   - LOOKUP queries: use exact entity names and codes; be very specific
   - COMPARISON queries: one query per item being compared, then one joint query
   - SUMMARISE queries: use "overview of", "summary of", "key points about"
   - EXISTENCE_CHECK: use "is there", "does X exist", "policy on", "allowed to"
   - PERSON_LOOKUP: use "who is responsible", "who approved", "in charge of"
   - DATE_LOOKUP: use "when", "deadline for", "effective date of", "schedule"
   - CAUSAL: use "why", "reason for", "cause of", "because"
   - CONDITIONAL: use "if", "conditions for", "when is", "under what circumstances"
   - LIST: use "all types of", "list of", "categories of", "what are the"
3. Use formal institutional language matching documents (avoid casual phrasing).
4. Include extracted entity names verbatim in at least one query.
5. Each query must be meaningfully different — not just synonym substitution.

Return ONLY a JSON object:
{{"queries": ["query 1", "query 2", ..., "query {n}"]}}
No markdown fences. No explanation.
"""


def _intent_to_top_k(intent: IntentResult) -> int:
    """More nodes for complex/list/comparison intents."""
    if intent.intent_type in ("COMPARISON", "LIST", "SUMMARISE"):
        return min(RETRIEVAL_STAGE2_TOP_K * 2, 10)
    if intent.complexity == "complex":
        return min(RETRIEVAL_STAGE2_TOP_K + 2, 8)
    return RETRIEVAL_STAGE2_TOP_K


def _intent_to_n_queries(intent: IntentResult) -> int:
    """More variants for complex intents."""
    if intent.complexity == "complex" or intent.intent_type == "COMPARISON":
        return MULTI_QUERY_COUNT + 2
    if intent.complexity == "moderate":
        return MULTI_QUERY_COUNT
    return max(MULTI_QUERY_COUNT - 1, 2)


def plan_retrieval(
    intent:          IntentResult,
    rewritten_query: str,
    doc_titles:      str = "",
) -> RetrievalPlan:
    """
    Generate a complete retrieval plan for the given intent.

    Parameters
    ----------
    intent          : IntentResult from the Intent Agent.
    rewritten_query : The LLM-rewritten version of the user's query.
    doc_titles      : Comma-separated titles of available documents.

    Returns
    -------
    RetrievalPlan with all strategy parameters set.
    """
    n = _intent_to_n_queries(intent)
    top_k = _intent_to_top_k(intent)

    # Build the planner prompt.
    topics   = ", ".join(intent.all_topics) or rewritten_query
    entities = ", ".join(intent.all_entities_flat) or "none"

    prompt = _PLANNER_PROMPT.format(
        query        = rewritten_query,
        intent_type  = intent.intent_type,
        search_focus = intent.search_focus,
        topics       = topics,
        entities     = entities,
        n            = n,
    )

    queries: list[str] = [rewritten_query]   # always include the rewritten query

    try:
        raw  = call_llm(prompt, expect_json=True)
        data = parse_json_response(raw)
        generated = [str(q).strip() for q in data.get("queries", []) if str(q).strip()]
        # Deduplicate against rewritten_query.
        seen = {rewritten_query.lower()}
        for q in generated:
            if q.lower() not in seen:
                seen.add(q.lower())
                queries.append(q)
        logger.info(
            "Planner generated %d queries for intent=%s complexity=%s",
            len(queries), intent.intent_type, intent.complexity,
        )
    except Exception as exc:
        logger.warning("Planner query generation failed (%s). Using rewritten query only.", exc)

    # Decide retrieval mode.
    if len(queries) == 1:
        mode = "single"
    elif intent.complexity == "complex":
        mode = "exhaustive"
    else:
        mode = "multi"

    # Disable reranker for simple lookups to save time.
    use_reranker = RERANKER_ENABLED and (
        intent.complexity != "simple" or intent.intent_type in ("COMPARISON", "PROCEDURE")
    )

    return RetrievalPlan(
        queries         = queries,
        top_k           = top_k,
        use_reranker    = use_reranker,
        search_all_docs = intent.needs_multi_doc,
        mode            = mode,
        intent_type     = intent.intent_type,
        complexity      = intent.complexity,
    )