"""
core/query_processor.py — Query rewriting and multi-query generation.

Two enterprise features live here:

1. QUERY REWRITING
   Rewrites the raw user query to be more precise and retrieval-friendly.
   Uses the LLM to expand acronyms, resolve ambiguity, add domain context,
   and align phrasing with the kind of language found in institutional documents.

   Example
   -------
   Raw:    "what happens after surgery?"
   Rewritten: "What are the post-operative care procedures and patient discharge
               protocols following a surgical procedure?"

2. MULTI-QUERY GENERATION
   Generates N semantically distinct variants of the (rewritten) query.
   Each variant approaches the information need from a different angle.
   All variants are run against the retrieval pipeline in parallel, and
   their result sets are merged (union, deduped by node_id).

   This dramatically improves recall: a single query phrasing may miss sections
   that a paraphrase would catch.

   Example variants for "discharge policy after surgery":
   - "What are the post-surgical discharge criteria for inpatients?"
   - "Describe the procedure for releasing a patient after an operation."
   - "What documentation is required before a patient leaves the hospital post-surgery?"

Public surface
--------------
  rewrite_query(raw_query, doc_context)         → str
  generate_query_variants(query, n)             → list[str]
  process_query(raw_query, doc_context)         → ProcessedQuery
"""

from __future__ import annotations

import json
import logging
import re

from config import (
    MULTI_QUERY_COUNT,
    MULTI_QUERY_ENABLED,
    QUERY_REWRITE_ENABLED,
)
from core.llm import call_llm, parse_json_response

logger = logging.getLogger(__name__)


# ── Prompts ────────────────────────────────────────────────────────────────────

_REWRITE_PROMPT = """\
You are a search query optimiser for an institutional document retrieval system.
The documents are formal institutional records: policy manuals, medical records,
legal contracts, research reports, HR documents, and similar professional texts.

Your task: rewrite the user's query to maximise retrieval precision.

Rules:
1. Expand abbreviations and acronyms to their full form.
2. Replace informal language with formal, document-appropriate terminology.
3. Make implicit intent explicit (e.g. "what happens after surgery" → "post-operative patient care and discharge protocols").
4. Keep the rewritten query as a single sentence or short paragraph.
5. Do NOT answer the question — only improve the query.
6. Do NOT add information not implied by the original query.

Available document context (titles of ingested documents):
{doc_context}

Original query: {query}

Return ONLY the rewritten query string. No preamble, no explanation, no quotes.
"""

_MULTI_QUERY_PROMPT = """\
You are a search query diversification engine for a document retrieval system.

Given a query, generate {n} semantically DISTINCT variants that cover the same
information need from different angles.

Rules:
1. Each variant must be phrased differently — not just synonym substitution.
2. Variants should approach the topic from different entry points:
   - procedural angle ("how is X done?")
   - definition angle ("what is X?")
   - criteria/condition angle ("what are the requirements for X?")
   - responsibility angle ("who is responsible for X?")
3. All variants must stay on-topic and not introduce unrelated subjects.
4. Each variant should be one clear sentence.

Query: {query}

Return a JSON object with exactly one key "variants" whose value is a JSON array
of {n} strings. Example: {{"variants": ["...", "...", "..."]}}
Return ONLY the JSON object. No markdown fences, no preamble.
"""


# ── Data class ─────────────────────────────────────────────────────────────────

class ProcessedQuery:
    """
    Result of the full query processing pipeline.

    Attributes
    ----------
    original     : The raw query as typed by the user.
    rewritten    : The LLM-improved, retrieval-optimised version.
    variants     : List of N diverse query reformulations (includes rewritten).
    all_queries  : Combined list to run against the retrieval pipeline.
    """

    def __init__(
        self,
        original:  str,
        rewritten: str,
        variants:  list[str],
    ):
        self.original    = original
        self.rewritten   = rewritten
        self.variants    = variants
        # The full set: rewritten query + all variants, deduplicated.
        seen: set[str] = set()
        self.all_queries: list[str] = []
        for q in [rewritten] + variants:
            q_norm = q.strip()
            if q_norm and q_norm not in seen:
                seen.add(q_norm)
                self.all_queries.append(q_norm)

    def __repr__(self) -> str:
        return (
            f"ProcessedQuery(original={self.original!r}, "
            f"variants={len(self.all_queries)})"
        )


# ── Feature functions ──────────────────────────────────────────────────────────

def rewrite_query(raw_query: str, doc_context: str = "") -> str:
    """
    Rewrite a raw user query to be more precise and retrieval-friendly.

    The LLM is given the list of document titles so it can align terminology
    with the actual vocabulary present in the knowledge base.

    Parameters
    ----------
    raw_query   : The original user query string.
    doc_context : Comma-separated list of ingested document titles (optional).
                  Helps the LLM understand the domain and tailor terminology.

    Returns
    -------
    Rewritten query string.  Falls back to the original on any error.
    """
    if not QUERY_REWRITE_ENABLED or not raw_query.strip():
        return raw_query

    prompt = _REWRITE_PROMPT.format(
        doc_context=doc_context or "No documents specified.",
        query=raw_query.strip(),
    )

    try:
        rewritten = call_llm(prompt).strip()
        # Sanity check: if the LLM returned something clearly wrong, fall back.
        if not rewritten or len(rewritten) < 5 or len(rewritten) > 2000:
            logger.warning("Query rewrite produced invalid output, falling back.")
            return raw_query
        logger.info(
            "Query rewritten: %r → %r",
            raw_query[:60], rewritten[:60],
        )
        return rewritten
    except Exception as exc:
        logger.warning("Query rewrite failed (%s), using original.", exc)
        return raw_query


def generate_query_variants(query: str, n: int = MULTI_QUERY_COUNT) -> list[str]:
    """
    Generate N semantically distinct variants of the given query.

    Each variant attacks the same information need from a different linguistic
    angle.  Running all variants through retrieval and merging results gives
    significantly higher recall than a single query.

    Parameters
    ----------
    query : The (optionally rewritten) query string.
    n     : Number of variants to generate.

    Returns
    -------
    List of variant strings.  Returns [] on any failure (caller degrades
    gracefully by using the rewritten query alone).
    """
    if not MULTI_QUERY_ENABLED or not query.strip() or n < 1:
        return []

    prompt = _MULTI_QUERY_PROMPT.format(query=query.strip(), n=n)

    try:
        raw = call_llm(prompt, expect_json=True)
        data = parse_json_response(raw)
        variants = [str(v).strip() for v in data.get("variants", []) if str(v).strip()]
        # Deduplicate variants that are too similar to the original query.
        filtered = [v for v in variants if v.lower() != query.lower()]
        logger.info(
            "Generated %d query variants for: %r",
            len(filtered), query[:60],
        )
        return filtered[:n]
    except Exception as exc:
        logger.warning("Multi-query generation failed (%s), skipping variants.", exc)
        return []


def process_query(raw_query: str, doc_context: str = "") -> ProcessedQuery:
    """
    Full query processing pipeline: rewrite → diversify.

    This is the entry point called by the query service.

    Steps
    -----
    1. Rewrite the raw query for retrieval precision.
    2. Generate N diverse variants of the rewritten query.
    3. Return a ProcessedQuery with all_queries = [rewritten] + variants.

    Parameters
    ----------
    raw_query   : User's original question.
    doc_context : Titles of all currently ingested documents (comma-separated).

    Returns
    -------
    ProcessedQuery dataclass with original, rewritten, variants, and all_queries.
    """
    rewritten = rewrite_query(raw_query, doc_context)
    variants  = generate_query_variants(rewritten, n=MULTI_QUERY_COUNT)

    return ProcessedQuery(
        original  = raw_query,
        rewritten = rewritten,
        variants  = variants,
    )