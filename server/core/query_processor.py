"""
core/query_processor.py — Query rewriting with improved chain-of-thought prompts.

Used as a standalone step by the orchestrator (before intent + planner agents).
"""

from __future__ import annotations

import logging

from config import QUERY_REWRITE_ENABLED
from core.llm import call_llm

logger = logging.getLogger(__name__)

# ── Improved rewrite prompt — chain-of-thought + domain-aware ─────────────────

_REWRITE_PROMPT = """\
You are a search query precision engineer for an institutional document retrieval system.
Documents include: policy manuals, medical records, legal contracts, HR documents,
research reports, procedures, guidelines, and technical standards.

TASK: Transform the user's query into the most effective retrieval query possible.

REASONING STEPS (do this internally, do not output the steps):
1. Identify the core information need — what would fully satisfy this question?
2. Spot any informal, ambiguous, or abbreviated language.
3. Identify domain-specific terminology that likely appears in formal documents.
4. Consider what section title or heading would contain this information.
5. Form a precise query that uses formal institutional vocabulary.

TRANSFORMATION RULES:
- Expand ALL abbreviations (e.g. "HR" → "Human Resources", "OT" → "Overtime")
- Replace informal with formal: "fired" → "termination of employment"
- Make implicit intent explicit: "after surgery?" → "post-operative patient care protocols"
- Include likely document vocabulary: "approved by", "pursuant to", "as per Section"
- If the query mentions a person's role, include both the role AND likely formal title
- Keep the rewritten query as ONE clear sentence (max 60 words)

AVAILABLE DOCUMENTS IN KNOWLEDGE BASE:
{doc_context}

ORIGINAL QUERY: {query}

Output ONLY the rewritten query. No quotes, no explanation, no preamble.
"""


def rewrite_query(raw_query: str, doc_context: str = "") -> str:
    """
    Rewrite a raw user query for retrieval precision.

    Returns the rewritten query, or the original on any failure.
    """
    if not QUERY_REWRITE_ENABLED or not raw_query.strip():
        return raw_query

    prompt = _REWRITE_PROMPT.format(
        doc_context = doc_context or "General institutional documents.",
        query       = raw_query.strip(),
    )

    try:
        rewritten = call_llm(prompt).strip()
        # Sanity check.
        if not rewritten or len(rewritten) < 5 or len(rewritten) > 2000:
            return raw_query
        logger.info("Rewritten: %r → %r", raw_query[:50], rewritten[:50])
        return rewritten
    except Exception as exc:
        logger.warning("Rewrite failed (%s), using original.", exc)
        return raw_query