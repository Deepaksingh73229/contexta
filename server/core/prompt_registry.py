"""
core/prompt_registry.py — Central registry for every LLM prompt template.

Every prompt used anywhere in the system lives here as a named PromptTemplate.
Callers render a prompt via:

    from core.prompt_registry import get_prompt
    prompt = get_prompt("node_summary", title="Introduction", content="...")

Adding a new prompt means adding one entry to PROMPT_REGISTRY at the bottom.
Modifying a prompt requires changing only this file.

Template variables use standard Python str.format() syntax: {variable_name}.

Registry keys (alphabetical)
─────────────────────────────
  answer_generation         — final grounded answer from retrieved context
  confidence_evaluation     — rate evidence quality (HIGH/MEDIUM/LOW)
  image_description         — vision LLM prompt for extracted images
  intent_analysis           — classify query intent + extract entities
  node_summary              — rich structured node summary (primary)
  node_summary_fallback     — plain 2-3 sentence fallback summary
  query_rewrite             — rewrite raw query for retrieval precision
  retrieval_plan            — generate query variants for a given intent
  synthesis_causal          — answer "why does X happen"
  synthesis_comparison      — answer compare X vs Y
  synthesis_conditional     — answer "what happens if X"
  synthesis_date_lookup     — answer "when was X"
  synthesis_definition      — answer "what is X"
  synthesis_default         — fallback synthesis for unknown intent
  synthesis_existence_check — answer "does X exist / is X allowed"
  synthesis_list            — answer "list all X"
  synthesis_lookup          — answer specific fact / value
  synthesis_person_lookup   — answer "who is responsible for X"
  synthesis_procedure       — answer "how do I do X" (step list)
  synthesis_summarise       — answer "give me an overview of X"
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ── Template dataclass ─────────────────────────────────────────────────────────

@dataclass
class PromptTemplate:
    """
    One registered prompt template.

    Attributes
    ----------
    key          : Unique registry key.
    template     : Raw string with {variable} placeholders.
    description  : Human-readable purpose (shown in admin/debug tooling).
    expect_json  : Whether the LLM should be asked for JSON output.
    variables    : List of required placeholder names (for validation).
    """
    key:         str
    template:    str
    description: str           = ""
    expect_json: bool          = False
    variables:   list[str]     = field(default_factory=list)

    def render(self, **kwargs: Any) -> str:
        """
        Render the template with the provided keyword arguments.

        Raises
        ------
        KeyError  : if a required variable is missing from kwargs.
        """
        missing = [v for v in self.variables if v not in kwargs]
        if missing:
            raise KeyError(
                f"Prompt '{self.key}' is missing required variables: {missing}. "
                f"Got: {list(kwargs.keys())}"
            )
        return self.template.format(**kwargs)


# ── Shared system blocks ───────────────────────────────────────────────────────
# These are used as {system} inside synthesis templates — kept here so the
# anti-hallucination rules can be updated in one place.

_SYNTHESIS_SYSTEM = """\
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
- No apologies. Just the answer.\
"""

_ANSWER_FOOTER = """\

QUESTION: {query}

DOCUMENT EXCERPTS:
{context}
"""


# ══════════════════════════════════════════════════════════════════════════════
#  PROMPT REGISTRY
#  Every LLM call in the codebase maps to exactly one entry here.
# ══════════════════════════════════════════════════════════════════════════════

PROMPT_REGISTRY: dict[str, PromptTemplate] = {}


def _register(*templates: PromptTemplate) -> None:
    for t in templates:
        PROMPT_REGISTRY[t.key] = t


# ─────────────────────────────────────────────────────────────────────────────
#  1. NODE SUMMARY  (core/builder.py + services/ingestion_pipeline.py)
# ─────────────────────────────────────────────────────────────────────────────

_register(

    PromptTemplate(
        key         = "node_summary",
        description = "Rich structured node summary — improves BM25 recall and embedding quality.",
        variables   = ["title", "content"],
        template    = """\
You are summarising a section of an institutional document for a retrieval system.
Your summary will be used BOTH as a human-readable description AND as the text
that gets embedded and keyword-searched.  Quality here directly improves retrieval accuracy.

Write a structured summary with FOUR parts:

1. SCOPE (1 sentence): What does this section cover overall?
2. KEY TOPICS (bullet list, 3-6 items): The main concepts, procedures, or rules discussed.
3. ENTITIES (comma-separated): Named people, departments, locations, codes, or systems mentioned.
4. KEYWORDS (comma-separated): Important technical terms, acronyms, or exact phrases
   a user might search for.

Format your response EXACTLY as:
SCOPE: <one sentence>
TOPICS: <bullet list>
ENTITIES: <comma-separated list or "none">
KEYWORDS: <comma-separated list>

Section title: {title}

Section content:
{content}""",
    ),

    PromptTemplate(
        key         = "node_summary_fallback",
        description = "Plain 2-3 sentence fallback used when the rich summary prompt fails.",
        variables   = ["title", "content"],
        template    = """\
Summarize the following document section in 2-3 sentences.
State only facts found in the text. Include important technical terms and entity names.
Do NOT begin with "Here is a summary" or similar preamble.

Section title: {title}

Section content:
{content}""",
    ),

)

# ─────────────────────────────────────────────────────────────────────────────
#  2. IMAGE DESCRIPTION  (core/image_processor.py)
# ─────────────────────────────────────────────────────────────────────────────

_register(

    PromptTemplate(
        key         = "image_description",
        description = "Vision LLM prompt — describes an image for the retrieval knowledge base.",
        variables   = [],          # no text variables; image bytes passed separately
        template    = """\
You are analysing an image for an institutional knowledge retrieval system.
Your description will be the ONLY searchable text for this image — precision matters.

Describe the image using this exact structure:

SCOPE: One sentence — what type of image is this and what does it show overall?
TOPICS: 3-6 bullet points of the key information, data, or concepts shown.
ENTITIES: Comma-separated list of named items visible (organisations, people, systems, product names, codes, labels).
KEYWORDS: Comma-separated technical terms, numbers, axis labels, column headers, or exact phrases a user might search for.
TYPE: One word only — chart / diagram / table / photo / screenshot / map / other

Rules:
- Extract ALL visible text, numbers, labels, legends, and annotations.
- For charts: state the chart type, axis names, and key data points or trends.
- For tables: list column headers and note significant values.
- For diagrams/flowcharts: describe components and relationships between them.
- For photos: state what is shown factually.
- Do NOT say "I can see" or "The image shows" — state facts directly.
- If the image is purely decorative (logo, divider, watermark, icon with no data), reply with exactly: SKIP""",
    ),

)

# ─────────────────────────────────────────────────────────────────────────────
#  3. QUERY REWRITING  (core/query_processor.py)
# ─────────────────────────────────────────────────────────────────────────────

_register(

    PromptTemplate(
        key         = "query_rewrite",
        description = "Rewrites a raw user query into formal institutional vocabulary for better retrieval.",
        variables   = ["doc_context", "query"],
        template    = """\
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

Output ONLY the rewritten query. No quotes, no explanation, no preamble.""",
    ),

)

# ─────────────────────────────────────────────────────────────────────────────
#  4. INTENT ANALYSIS  (core/agents/intent_agent.py)
# ─────────────────────────────────────────────────────────────────────────────

_register(

    PromptTemplate(
        key         = "intent_analysis",
        description = "Classifies query intent and extracts entities. Returns structured JSON.",
        expect_json = True,
        variables   = ["query"],
        template    = """\
You are the Intent Analysis Agent for an institutional document retrieval system.
Your job is to deeply understand what the user is looking for before any search begins.

You must reason step by step, then output a structured JSON result.

STEP 1 — READ THE QUERY CAREFULLY:
Identify the core information need. What type of answer would fully satisfy the user?

STEP 2 — CLASSIFY INTENT:
Choose the SINGLE best intent type:
  DEFINITION      → User wants to know what something IS (definition, meaning, description)
  PROCEDURE       → User wants to know HOW to do something (steps, process, method)
  LOOKUP          → User wants a specific fact, value, date, number, or named item
  COMPARISON      → User wants to compare two or more things
  SUMMARISE       → User wants a high-level overview of a topic
  EXISTENCE_CHECK → User wants to know if something exists or is allowed
  LIST            → User wants all items of a category
  CAUSAL          → User wants to know WHY something happens
  CONDITIONAL     → User wants to know what happens under certain conditions
  PERSON_LOOKUP   → User wants to know who is responsible for / authored / approved something
  DATE_LOOKUP     → User wants to know when something happened or is due

STEP 3 — EXTRACT ENTITIES:
List all named things in the query:
  departments  : e.g. ["HR", "Finance", "Legal"]
  people       : e.g. ["Dr Smith", "CEO", "Department Head"]
  topics       : e.g. ["leave policy", "discharge procedure", "insurance claim"]
  dates        : e.g. ["2023", "Q3", "fiscal year"]
  codes        : e.g. ["Form-17", "Section 4.2", "CC-7"]
  doc_types    : e.g. ["policy", "manual", "contract", "report"]

STEP 4 — WRITE THE SEARCH FOCUS:
In one precise sentence, describe exactly what chunk of text in the documents
would answer this question.

STEP 5 — JUDGE COMPLEXITY:
  simple   → single fact, single section, single document likely
  moderate → spans 2-3 sections, may need synthesis
  complex  → multi-document, requires comparison or synthesis across many sources

USER QUERY: {query}

Now output ONLY a JSON object with this exact structure:
{{
  "reasoning": "<your step-by-step thinking as a single string>",
  "intent_type": "<one of the intent types above>",
  "confidence": <0.0 to 1.0>,
  "entities": {{
    "departments": [],
    "people": [],
    "topics": [],
    "dates": [],
    "codes": [],
    "doc_types": []
  }},
  "search_focus": "<one precise sentence describing what to retrieve>",
  "complexity": "<simple|moderate|complex>"
}}

Return ONLY the JSON. No markdown fences. No preamble.""",
    ),

)

# ─────────────────────────────────────────────────────────────────────────────
#  5. RETRIEVAL PLAN  (core/agents/planner_agent.py)
# ─────────────────────────────────────────────────────────────────────────────

_register(

    PromptTemplate(
        key         = "retrieval_plan",
        description = "Generates N search query variants tailored to the detected intent type.",
        expect_json = True,
        variables   = ["query", "intent_type", "search_focus", "topics", "entities", "n"],
        template    = """\
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
No markdown fences. No explanation.""",
    ),

)

# ─────────────────────────────────────────────────────────────────────────────
#  6. ANSWER GENERATION  (core/retriever.py — standalone fallback)
# ─────────────────────────────────────────────────────────────────────────────

_register(

    PromptTemplate(
        key         = "answer_generation",
        description = "Grounded answer from retrieved context — used by retriever.generate_answer().",
        variables   = ["query", "context"],
        template    = """\
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

Answer:""",
    ),

)

# ─────────────────────────────────────────────────────────────────────────────
#  7. CONFIDENCE EVALUATION  (core/agents/synthesis_agent.py)
# ─────────────────────────────────────────────────────────────────────────────

_register(

    PromptTemplate(
        key         = "confidence_evaluation",
        description = "Rates evidence quality (HIGH/MEDIUM/LOW) and lists gaps. Returns JSON.",
        expect_json = True,
        variables   = ["query", "n_sections", "context_summary"],
        template    = """\
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
{{"confidence": "HIGH|MEDIUM|LOW", "gaps": ["gap 1", "gap 2"]}}""",
    ),

)

# ─────────────────────────────────────────────────────────────────────────────
#  8. SYNTHESIS PROMPTS  (core/agents/synthesis_agent.py)
#     One entry per intent type — intent-aware answer formatting.
# ─────────────────────────────────────────────────────────────────────────────

_register(

    PromptTemplate(
        key         = "synthesis_definition",
        description = "Answers 'What is X?' — returns a structured definition.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

The user wants a DEFINITION or explanation of a concept.

Format your answer as:
1. A clear, direct 1-2 sentence definition.
2. Key characteristics or components (bullet list if more than 2).
3. Any important exceptions or conditions mentioned in the documents.
{_ANSWER_FOOTER}
Provide the definition. If the context does not define this term, state that clearly.""",
    ),

    PromptTemplate(
        key         = "synthesis_procedure",
        description = "Answers 'How do I do X?' — returns a numbered step list.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

The user wants to know HOW to do something — steps, process, or method.

Format your answer as a NUMBERED STEP LIST:
- Each step on its own numbered line.
- Include prerequisites if mentioned.
- Include any warnings or conditions from the documents.
- End with the expected outcome if mentioned.

If the procedure has multiple sub-procedures, organise with clear headings.
{_ANSWER_FOOTER}
List the procedure steps:""",
    ),

    PromptTemplate(
        key         = "synthesis_lookup",
        description = "Answers a specific fact / value / code / date query.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

The user wants a SPECIFIC FACT — a value, name, date, code, or named item.

Answer with:
1. The specific fact, stated directly in the first sentence.
2. One sentence of context (what this value means or applies to).
3. Any conditions or exceptions.

Be extremely precise. If the fact is a number, code, or date, quote it exactly.
{_ANSWER_FOOTER}
State the specific fact:""",
    ),

    PromptTemplate(
        key         = "synthesis_comparison",
        description = "Answers 'Compare X vs Y' — returns a structured comparison.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

The user wants to COMPARE two or more things.

Format your answer as:
1. Brief intro sentence naming what is being compared.
2. A structured comparison — either a table (use markdown) or parallel bullet points.
3. A summary of the key difference or recommendation if the documents contain one.

Structure:
**[Item A]**: ...key points...
**[Item B]**: ...key points...
**Key difference**: ...
{_ANSWER_FOOTER}
Provide the comparison:""",
    ),

    PromptTemplate(
        key         = "synthesis_summarise",
        description = "Answers 'Give me an overview of X' — returns a concise topic summary.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

The user wants a SUMMARY or overview.

Format your answer as:
1. One-sentence topic overview.
2. Key points (3-6 bullets), each citing its source section.
3. Any important caveats or conditions.

Be comprehensive but concise. Cover the breadth of what the documents say.
{_ANSWER_FOOTER}
Provide the summary:""",
    ),

    PromptTemplate(
        key         = "synthesis_existence_check",
        description = "Answers 'Does X exist / is X allowed?' — returns YES/NO/CONDITIONAL.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

The user wants to know if something EXISTS, IS ALLOWED, or IS REQUIRED.

Answer directly with YES / NO / PARTIAL (if conditionally allowed), then explain:
1. The direct answer (Yes/No/Conditional).
2. The specific policy or rule that governs this.
3. Any conditions, exceptions, or approval requirements.
{_ANSWER_FOOTER}
State whether this exists or is allowed:""",
    ),

    PromptTemplate(
        key         = "synthesis_list",
        description = "Answers 'List all X' — returns a complete enumeration.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

The user wants a LIST of all items in a category.

Format your answer as:
1. Brief intro (what you are listing, from which section).
2. Numbered or bulleted list of ALL items found in the context.
3. Note if the list may be incomplete.
{_ANSWER_FOOTER}
Provide the complete list:""",
    ),

    PromptTemplate(
        key         = "synthesis_causal",
        description = "Answers 'Why does X happen?' — returns cause/reason explanation.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

The user wants to understand WHY something happens — causes, reasons, or explanations.

Format your answer as:
1. Direct statement of the primary cause or reason.
2. Contributing factors if multiple are mentioned (bullets).
3. Any chain of causation described in the documents.
{_ANSWER_FOOTER}
Explain the cause or reason:""",
    ),

    PromptTemplate(
        key         = "synthesis_conditional",
        description = "Answers 'What happens if X?' — returns condition/outcome pairs.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

The user wants to know what happens UNDER CERTAIN CONDITIONS.

Format your answer as:
1. State the condition clearly.
2. State the consequence or outcome that follows.
3. List any exceptions or edge cases.

If the documents describe multiple conditions, use "If... then..." format for each.
{_ANSWER_FOOTER}
Describe the conditions and outcomes:""",
    ),

    PromptTemplate(
        key         = "synthesis_person_lookup",
        description = "Answers 'Who is responsible for X?' — returns person/role/contact.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

The user wants to know WHO is responsible, who authored, or who approved something.

Answer with:
1. The person's name, title, or role — stated directly.
2. Their specific responsibility regarding this topic.
3. Contact information or escalation path if mentioned.

If no specific person is named, state the role or department responsible.
{_ANSWER_FOOTER}
Identify who is responsible:""",
    ),

    PromptTemplate(
        key         = "synthesis_date_lookup",
        description = "Answers 'When was X?' — returns exact dates/deadlines/timelines.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

The user wants a DATE, DEADLINE, TIMELINE, or SCHEDULE.

Answer with:
1. The specific date or timeframe — quoted exactly from the documents.
2. What this date refers to (effective date, deadline, review date, etc.).
3. Any related dates mentioned.

If no date is found, state that explicitly.
{_ANSWER_FOOTER}
State the date or timeline:""",
    ),

    PromptTemplate(
        key         = "synthesis_default",
        description = "Fallback synthesis used when intent_type does not match any specific template.",
        variables   = ["query", "context"],
        template    = f"""\
{_SYNTHESIS_SYSTEM}

Answer the user's question using ONLY the document context below.
Be direct, factual, and specific. Cite section titles when relevant.
{_ANSWER_FOOTER}
Answer:""",
    ),

)


# ══════════════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

def get_prompt(key: str, **kwargs: Any) -> str:
    """
    Fetch and render a prompt template by key.

    Parameters
    ----------
    key    : Registry key (e.g. "node_summary", "intent_analysis").
    kwargs : Template variables as keyword arguments.

    Returns
    -------
    Rendered prompt string ready to pass to call_llm().

    Raises
    ------
    KeyError : Unknown key or missing template variable.
    """
    template = PROMPT_REGISTRY.get(key)
    if template is None:
        available = sorted(PROMPT_REGISTRY.keys())
        raise KeyError(
            f"Unknown prompt key: '{key}'. "
            f"Available keys: {available}"
        )
    return template.render(**kwargs)


def prompt_expects_json(key: str) -> bool:
    """Return True if the template is marked as expecting JSON output."""
    template = PROMPT_REGISTRY.get(key)
    if template is None:
        return False
    return template.expect_json


def list_prompts() -> list[dict]:
    """Return a summary of all registered prompts (for admin/debug tooling)."""
    return [
        {
            "key":         t.key,
            "description": t.description,
            "expect_json": t.expect_json,
            "variables":   t.variables,
        }
        for t in sorted(PROMPT_REGISTRY.values(), key=lambda t: t.key)
    ]