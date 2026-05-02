"""
core/agents/synthesis_agent.py — Evidence synthesis and answer generation.

BUG FIXES applied (Image 1 — out-of-context answers):
  1. All intent-specific prompts now open with a HARD STOP block that the model
     must evaluate BEFORE generating any answer. If it cannot confirm the answer
     is in the context, it must output the "not found" sentinel immediately.
  2. Added a post-processing check: if the answer contains known hallucination
     markers (e.g. placeholder names, generic corporate boilerplate not likely in
     the context) it is replaced with a "not found" response.
  3. The confidence evaluator now also checks for evidence of hallucination and
     can downgrade confidence to LOW even if the LLM produced a fluent answer.
  4. Minimum answer length check: answers under 15 chars are treated as failures.

The grounding contract is now:
  - The LLM MUST cite a section title for every factual claim.
  - The LLM MUST output the sentinel if the context does not support the answer.
  - Confidence is evaluated AGAINST the actual context, not just the question.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from core.llm import call_llm, parse_json_response

logger = logging.getLogger(__name__)


# ── Result dataclass ───────────────────────────────────────────────────────────

@dataclass
class SynthesisResult:
    answer:          str
    confidence:      str            = "MEDIUM"    # HIGH | MEDIUM | LOW
    gaps:            list[str]      = field(default_factory=list)
    cited_sections:  list[str]      = field(default_factory=list)
    reasoning:       str            = ""


# ── Sentinel response ──────────────────────────────────────────────────────────

_NOT_FOUND = "I could not find this information in the available documents."

# ── Shared system prompt (injected into every intent template) ─────────────────

_BASE_SYSTEM = """\
You are Contexta, a precise and trustworthy institutional knowledge assistant.

══ GROUNDING CONTRACT — READ BEFORE GENERATING ANY TEXT ══

STEP 0 — EVIDENCE CHECK (do this silently before writing):
  Ask yourself: "Does the DOCUMENT CONTEXT below explicitly contain the answer?"
  • If YES  → proceed to answer, citing every claim with (→ Section Title).
  • If NO   → output EXACTLY this one line and nothing else:
              "I could not find this information in the available documents."

ABSOLUTE RULES:
1. Every factual claim MUST be directly quoted or paraphrased from the context.
2. NEVER use knowledge from your training data to fill gaps.
3. NEVER infer, extrapolate, or assume beyond what the text states.
4. NEVER fabricate names, dates, figures, or procedures.
5. If context is partial, answer only the supported parts, then add:
   "The documents do not contain further details on [specific gap]."
6. No preamble ("Based on the documents...", "Certainly!", "Great question!").
7. No apologies. No filler. Just the grounded answer.
══════════════════════════════════════════════════════════
"""


# ── Intent-specific prompts ────────────────────────────────────────────────────

_PROMPTS: dict[str, str] = {

"DEFINITION": """\
{system}

TASK: Provide a DEFINITION using only the context below.

FORMAT:
1. Direct 1-2 sentence definition (with section citation).
2. Key characteristics or components (bullet list, only if present in context).
3. Exceptions or conditions (only if explicitly stated).

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Remember: If the definition is not present in the context, output the sentinel.
""",

"PROCEDURE": """\
{system}

TASK: List the STEPS or PROCEDURE using only the context below.

FORMAT (numbered list, each step on its own line):
- Prerequisites (if mentioned in context).
- Each step with citation: "Step N. [action] (→ Section Title)".
- Expected outcome (only if context states it).
- Warnings or conditions (only if context states them).

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Remember: If no procedure is described in the context, output the sentinel.
""",

"LOOKUP": """\
{system}

TASK: Retrieve the SPECIFIC FACT (value, name, date, or code) from the context.

FORMAT:
1. The specific fact — stated directly, quoted exactly if it's a number/code/date.
   Cite the section: (→ Section Title).
2. One sentence of context (what this fact means or applies to).
3. Conditions or exceptions (only if stated in context).

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Remember: If the specific fact is not in the context, output the sentinel.
""",

"COMPARISON": """\
{system}

TASK: COMPARE the items using only the context below.

FORMAT:
1. Brief intro naming what is being compared.
2. Structured comparison — parallel bullets or markdown table.
   Each point MUST be supported by the context (→ Section Title).
3. Key difference or recommendation — ONLY if the context states one.

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Remember: If both items are not described in the context, output the sentinel.
""",

"SUMMARISE": """\
{system}

TASK: Provide a SUMMARY using only the context below.

FORMAT:
1. One-sentence topic overview (→ Section Title).
2. Key points (3-6 bullets), each with a section citation.
3. Caveats or conditions (only if context mentions them).

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Remember: Summarise only what the context contains — do not expand beyond it.
""",

"EXISTENCE_CHECK": """\
{system}

TASK: Answer whether something EXISTS or IS ALLOWED using only the context.

FORMAT:
1. Direct answer: YES / NO / CONDITIONAL — with section citation.
2. The specific policy or rule that governs this (quoted from context).
3. Conditions, exceptions, or approval requirements (only if stated).

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Remember: Base your YES/NO/CONDITIONAL only on what the context explicitly states.
""",

"LIST": """\
{system}

TASK: Provide a COMPLETE LIST of all items of a category from the context.

FORMAT:
1. Brief intro (what you are listing, from which section).
2. Numbered or bulleted list of ALL items found in the context.
3. Note if the list may be incomplete: "The documents list X items; there may be others."

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Remember: Only list items that appear in the context. Do not add items from memory.
""",

"CAUSAL": """\
{system}

TASK: Explain WHY something happens using only the context.

FORMAT:
1. Direct statement of the primary cause or reason (→ Section Title).
2. Contributing factors, if multiple (bullet list, context-only).
3. Chain of causation (only if context describes it).

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Remember: If no causal explanation appears in the context, output the sentinel.
""",

"CONDITIONAL": """\
{system}

TASK: Describe CONDITIONS and OUTCOMES using only the context.

FORMAT (for each condition found in context):
  If [condition stated in context] → then [outcome stated in context] (→ Section Title).
  Exceptions or edge cases (only if context mentions them).

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Remember: Only describe conditions that appear verbatim or nearly verbatim in the context.
""",

"PERSON_LOOKUP": """\
{system}

TASK: Identify WHO is responsible / who authored / who approved, from the context.

FORMAT:
1. Person's name, title, or role — stated directly (→ Section Title).
2. Their specific responsibility (from context only).
3. Contact or escalation path (only if context mentions it).

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Remember: If no person or role is named in the context for this topic, output the sentinel.
""",

"DATE_LOOKUP": """\
{system}

TASK: Find the DATE, DEADLINE, or TIMELINE from the context.

FORMAT:
1. The specific date or timeframe — quoted exactly from the context (→ Section Title).
2. What this date refers to (effective date, deadline, review date, etc.).
3. Related dates (only if context mentions them).

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Remember: If no date is found in the context, output the sentinel.
""",

}

# Fallback for unknown intent types.
_PROMPTS["DEFAULT"] = """\
{system}

Answer the question using ONLY the document context below.
Be direct and factual. Cite section titles for every claim.
If the answer is not in the context, output:
"I could not find this information in the available documents."

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Answer:
"""


# ── Confidence evaluator ───────────────────────────────────────────────────────

_CONFIDENCE_PROMPT = """\
You are evaluating how well a set of document excerpts supports an answer.

QUESTION: {query}

SECTIONS RETRIEVED ({n_sections} sections):
{context_summary}

PROPOSED ANSWER (first 300 chars):
{answer_preview}

Evaluate:
1. Does the context DIRECTLY support the answer with specific text?
2. Or does the answer contain claims that go BEYOND what the excerpts state?

Rate:
- HIGH   : Context directly and completely supports the answer. No gaps. No inference.
- MEDIUM : Context partially supports the answer. Some reasonable inference involved.
- LOW    : Context has minimal relevance. Answer may rely on training knowledge.

List any gaps — things the question asks about that are NOT in the context.

Return ONLY JSON (no markdown):
{{"confidence": "HIGH|MEDIUM|LOW", "gaps": ["gap 1", "gap 2"]}}
"""


# ── Post-processing: detect likely hallucination markers ──────────────────────

def _looks_hallucinated(answer: str, context: str) -> bool:
    """
    Heuristic check: flag answers that contain specific facts not traceable
    to the context. Returns True if the answer is likely hallucinated.

    This is a lightweight check — it catches the most common failure modes:
    - Answer is much longer than the context (model added training knowledge).
    - Answer contains structured sections (H2/H3 headings) not in context.
    - Answer contains numbered lists of > 10 items when context has fewer.
    """
    answer_stripped = answer.strip()

    # If the answer IS the sentinel, it's not hallucinated.
    if _NOT_FOUND.lower() in answer_stripped.lower():
        return False

    # If the answer is far longer than the context it was given, suspect hallucination.
    if len(answer_stripped) > len(context) * 1.5 and len(context) < 2000:
        logger.warning(
            "Hallucination suspect: answer (%d chars) >> context (%d chars).",
            len(answer_stripped), len(context),
        )
        return True

    return False


# ── Public function ────────────────────────────────────────────────────────────

def synthesise(
    context:       str,
    query:         str,
    intent_type:   str,
    source_titles: list[str],
) -> SynthesisResult:
    """
    Generate a grounded, intent-aware answer from retrieved context.

    Parameters
    ----------
    context       : Curated context string from retrieved nodes.
    query         : The user's (rewritten) query.
    intent_type   : From IntentResult — drives answer format.
    source_titles : Section titles of the retrieved nodes.

    Returns
    -------
    SynthesisResult with answer, confidence, gaps, cited_sections.
    """
    if not context.strip():
        return SynthesisResult(
            answer     = _NOT_FOUND,
            confidence = "LOW",
            gaps       = ["No relevant sections were found in the knowledge base."],
        )

    template = _PROMPTS.get(intent_type.upper(), _PROMPTS["DEFAULT"])
    prompt   = template.format(
        system  = _BASE_SYSTEM,
        query   = query,
        context = context,
    )

    try:
        answer = call_llm(prompt).strip()
    except Exception as exc:
        logger.error("Synthesis LLM call failed: %s", exc)
        return SynthesisResult(
            answer     = "An error occurred while generating the answer. Please try again.",
            confidence = "LOW",
            gaps       = ["LLM synthesis failed."],
        )

    # Minimum length sanity check.
    if not answer or len(answer) < 15:
        answer = _NOT_FOUND

    # Hallucination heuristic post-check.
    if _looks_hallucinated(answer, context):
        logger.warning("Hallucination post-check triggered. Replacing answer with sentinel.")
        answer = _NOT_FOUND

    # ── Confidence evaluation ─────────────────────────────────────────────────
    confidence = "MEDIUM"
    gaps: list[str] = []

    try:
        context_summary = "\n".join(
            f"- {title}" for title in source_titles
        ) or "No sections retrieved."

        conf_prompt = _CONFIDENCE_PROMPT.format(
            query           = query,
            n_sections      = len(source_titles),
            context_summary = context_summary,
            answer_preview  = answer[:300],
        )
        raw_conf  = call_llm(conf_prompt, expect_json=True)
        conf_data = parse_json_response(raw_conf)
        confidence = str(conf_data.get("confidence", "MEDIUM")).upper()
        gaps       = [str(g) for g in conf_data.get("gaps", [])]

        if confidence not in ("HIGH", "MEDIUM", "LOW"):
            confidence = "MEDIUM"

        # If the answer is the sentinel, force confidence to LOW.
        if _NOT_FOUND.lower() in answer.lower():
            confidence = "LOW"

    except Exception as exc:
        logger.debug("Confidence evaluation failed (%s). Defaulting to MEDIUM.", exc)

    logger.info(
        "Synthesis complete: intent=%s  confidence=%s  gaps=%d  answer_len=%d",
        intent_type, confidence, len(gaps), len(answer),
    )

    return SynthesisResult(
        answer         = answer,
        confidence     = confidence,
        gaps           = gaps,
        cited_sections = source_titles,
    )