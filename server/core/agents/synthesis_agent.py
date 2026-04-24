"""
core/agents/synthesis_agent.py — Evidence synthesis and answer generation.

The Synthesis Agent is the FINAL agent in the pipeline.
It receives the curated context (retrieved nodes) and the user's original query,
and produces the grounded, structured final answer.

Unlike the old single-prompt answer generator, this agent:

1. Uses intent-aware answer prompts — each intent type has a tailored prompt
   that produces the right SHAPE of answer (step list for procedures,
   comparison table for comparisons, factual sentence for lookups, etc.)

2. Explicitly reasons about evidence quality before answering — it states
   what it found, what confidence it has, and flags any gaps.

3. Enforces strict anti-hallucination rules — the model is instructed to
   mark claims that go beyond the context as UNVERIFIED.

4. Produces a structured response with:
   - answer      : the main answer text
   - confidence  : HIGH / MEDIUM / LOW
   - gaps        : what the context did NOT contain (honest about limits)
   - cited_sections : section titles used (so the frontend can highlight them)

Public surface
--------------
  SynthesisResult   — dataclass with answer, confidence, gaps, cited_sections
  synthesise(context, query, intent_type, sources) → SynthesisResult
"""

from __future__ import annotations

import logging
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


# ── Base synthesis prompt ──────────────────────────────────────────────────────

_BASE_SYSTEM = """\
You are Contexta, a precise and trustworthy institutional knowledge assistant.
You answer questions using ONLY the document excerpts provided.
You NEVER fabricate information. You NEVER use knowledge from your training data.

ANTI-HALLUCINATION RULES (follow strictly):
1. Every factual claim in your answer MUST be directly supported by the context below.
2. If a claim is partially supported, mark it with [PARTIAL].
3. If you cannot find something, say so explicitly — do not guess or infer.
4. Do not extrapolate beyond what the text states.
5. Do not add examples not present in the context.
6. If the context is insufficient, say: "The available documents do not contain enough information about [specific gap]."

CITATION RULES:
- After any specific claim, note the section it came from: (→ Section Title).
- If the same fact appears in multiple sections, cite the most specific one.

QUALITY RULES:
- Be direct. Start with the answer, not with "Based on the documents..."
- No filler phrases ("Certainly!", "Great question!", "Of course!").
- No apologies. Just the answer.
"""

# ── Intent-specific answer prompts ────────────────────────────────────────────

_PROMPTS: dict[str, str] = {

"DEFINITION": """\
{system}

The user wants a DEFINITION or explanation of a concept.

Format your answer as:
1. A clear, direct 1-2 sentence definition.
2. Key characteristics or components (bullet list if more than 2).
3. Any important exceptions or conditions mentioned in the documents.

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Provide the definition. If the context does not define this term, state that clearly.
""",

"PROCEDURE": """\
{system}

The user wants to know HOW to do something — steps, process, or method.

Format your answer as a NUMBERED STEP LIST:
- Each step on its own numbered line.
- Include prerequisites if mentioned.
- Include any warnings or conditions from the documents.
- End with the expected outcome if mentioned.

If the procedure has multiple sub-procedures, organise with clear headings.

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

List the procedure steps:
""",

"LOOKUP": """\
{system}

The user wants a SPECIFIC FACT — a value, name, date, code, or named item.

Answer with:
1. The specific fact, stated directly in the first sentence.
2. One sentence of context (what this value means or applies to).
3. Any conditions or exceptions.

Be extremely precise. If the fact is a number, code, or date, quote it exactly.

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

State the specific fact:
""",

"COMPARISON": """\
{system}

The user wants to COMPARE two or more things.

Format your answer as:
1. Brief intro sentence naming what is being compared.
2. A structured comparison — either a table (use markdown) or parallel bullet points.
3. A summary of the key difference or recommendation if the documents contain one.

Structure:
**[Item A]**: ...key points...
**[Item B]**: ...key points...
**Key difference**: ...

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Provide the comparison:
""",

"SUMMARISE": """\
{system}

The user wants a SUMMARY or overview.

Format your answer as:
1. One-sentence topic overview.
2. Key points (3-6 bullets), each citing its source section.
3. Any important caveats or conditions.

Be comprehensive but concise. Cover the breadth of what the documents say.

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Provide the summary:
""",

"EXISTENCE_CHECK": """\
{system}

The user wants to know if something EXISTS, IS ALLOWED, or IS REQUIRED.

Answer directly with YES / NO / PARTIAL (if conditionally allowed), then explain:
1. The direct answer (Yes/No/Conditional).
2. The specific policy or rule that governs this.
3. Any conditions, exceptions, or approval requirements.

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

State whether this exists or is allowed:
""",

"LIST": """\
{system}

The user wants a LIST of all items in a category.

Format your answer as:
1. Brief intro (what you are listing, from which section).
2. Numbered or bulleted list of ALL items found in the context.
3. Note if the list may be incomplete ("The documents list X items; there may be others not covered.").

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Provide the complete list:
""",

"CAUSAL": """\
{system}

The user wants to understand WHY something happens — causes, reasons, or explanations.

Format your answer as:
1. Direct statement of the primary cause or reason.
2. Contributing factors if multiple are mentioned (bullets).
3. Any chain of causation described in the documents.

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Explain the cause or reason:
""",

"CONDITIONAL": """\
{system}

The user wants to know what happens UNDER CERTAIN CONDITIONS — rules, triggers, or scenarios.

Format your answer as:
1. State the condition clearly.
2. State the consequence or outcome that follows.
3. List any exceptions or edge cases.

If the documents describe multiple conditions, use "If... then..." format for each.

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Describe the conditions and outcomes:
""",

"PERSON_LOOKUP": """\
{system}

The user wants to know WHO is responsible, who authored, or who approved something.

Answer with:
1. The person's name, title, or role — stated directly.
2. Their specific responsibility regarding this topic.
3. Contact information or escalation path if mentioned.

If no specific person is named, state the role or department responsible.

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Identify who is responsible:
""",

"DATE_LOOKUP": """\
{system}

The user wants a DATE, DEADLINE, TIMELINE, or SCHEDULE.

Answer with:
1. The specific date or timeframe — quoted exactly from the documents.
2. What this date refers to (effective date, deadline, review date, etc.).
3. Any related dates mentioned (e.g. "effective from X, reviewed annually").

If no date is found, state that explicitly.

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

State the date or timeline:
""",

}

# Default fallback for unknown intents.
_PROMPTS["DEFAULT"] = """\
{system}

Answer the user's question using ONLY the document context below.
Be direct, factual, and specific. Cite section titles when relevant.

QUESTION: {query}

DOCUMENT CONTEXT:
{context}

Answer:
"""

# ── Confidence evaluator prompt ────────────────────────────────────────────────

_CONFIDENCE_PROMPT = """\
You are evaluating how well a set of document excerpts answers a question.

QUESTION: {query}

EXCERPTS PROVIDED (section count: {n_sections}):
{context_summary}

Rate the evidence quality:
- HIGH   : The context contains a direct, complete answer. No gaps.
- MEDIUM : The context contains partial information. Some inference needed.
- LOW    : The context has minimal relevant information. Answer is mostly inferred.

Also list any specific gaps — things the question asks about that are NOT in the context.

Return ONLY JSON:
{{"confidence": "HIGH|MEDIUM|LOW", "gaps": ["gap 1", "gap 2"]}}
"""


# ── Public function ────────────────────────────────────────────────────────────

def synthesise(
    context:      str,
    query:        str,
    intent_type:  str,
    source_titles: list[str],
) -> SynthesisResult:
    """
    Generate a grounded, intent-aware answer from retrieved context.

    Parameters
    ----------
    context       : Curated context string built from retrieved nodes.
    query         : The user's original (rewritten) query.
    intent_type   : From IntentResult — drives the answer format.
    source_titles : Section titles of the retrieved nodes (for citation tracking).

    Returns
    -------
    SynthesisResult with answer, confidence, gaps, and cited_sections.
    """
    if not context.strip():
        return SynthesisResult(
            answer     = "I could not find information about this in the available documents.",
            confidence = "LOW",
            gaps       = ["No relevant sections were found in the knowledge base."],
        )

    # Pick the intent-appropriate prompt template.
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

    if not answer or len(answer) < 10:
        answer = "I could not find this information in the available documents."

    # ── Confidence evaluation (lightweight second call) ───────────────────────
    confidence = "MEDIUM"
    gaps: list[str] = []

    try:
        # Use a compact context summary to keep this call fast.
        context_summary = "\n".join(
            f"- {title}" for title in source_titles
        ) or "No sections retrieved."

        conf_prompt = _CONFIDENCE_PROMPT.format(
            query           = query,
            n_sections      = len(source_titles),
            context_summary = context_summary,
        )
        raw_conf  = call_llm(conf_prompt, expect_json=True)
        conf_data = parse_json_response(raw_conf)
        confidence = str(conf_data.get("confidence", "MEDIUM")).upper()
        gaps       = [str(g) for g in conf_data.get("gaps", [])]

        if confidence not in ("HIGH", "MEDIUM", "LOW"):
            confidence = "MEDIUM"
    except Exception as exc:
        logger.debug("Confidence evaluation failed (%s). Defaulting to MEDIUM.", exc)

    logger.info(
        "Synthesis complete: intent=%s  confidence=%s  gaps=%d",
        intent_type, confidence, len(gaps),
    )

    return SynthesisResult(
        answer         = answer,
        confidence     = confidence,
        gaps           = gaps,
        cited_sections = source_titles,
    )