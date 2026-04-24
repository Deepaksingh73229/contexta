"""
core/agents/intent_agent.py — Query intent classification and entity extraction.

The Intent Agent is the FIRST agent in the multi-agent pipeline.
It reads the raw user query and produces a rich structured understanding of
what the user actually wants — before any retrieval happens.

Why this matters
----------------
"What is the leave policy?" and "Show me who approved the leave policy" are
both about leave policy, but they need completely different retrieval strategies:
- First:  definition lookup → find the section that defines the policy
- Second: entity extraction → find who authored/approved a specific document

Getting intent wrong before retrieval means retrieving the wrong nodes even
with perfect embeddings.

Intent types
------------
  DEFINITION      : "What is X?" / "What does X mean?"
  PROCEDURE       : "How do I X?" / "What are the steps to X?"
  LOOKUP          : "Find the X" / "What is the value of X?" — specific fact
  COMPARISON      : "Difference between X and Y" / "Compare X vs Y"
  SUMMARISE       : "Summarise the section on X" / "Give me an overview of X"
  EXISTENCE_CHECK : "Does X exist?" / "Is there a policy on X?"
  LIST            : "List all X" / "What are the types of X?"
  CAUSAL          : "Why does X happen?" / "What causes X?"
  CONDITIONAL     : "What happens if X?" / "Under what conditions is X allowed?"
  PERSON_LOOKUP   : "Who is responsible for X?" / "Who approved X?"
  DATE_LOOKUP     : "When was X approved?" / "What is the deadline for X?"

Output
------
IntentResult dataclass with:
  intent_type  : one of the types above
  confidence   : 0.0–1.0
  entities     : {"departments": [...], "people": [...], "dates": [...], ...}
  search_focus : a 1-sentence description of exactly what to retrieve
  complexity   : "simple" | "moderate" | "complex"  (drives planner strategy)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from core.llm import call_llm, parse_json_response

logger = logging.getLogger(__name__)

# ── Intent prompt — chain-of-thought + structured JSON output ─────────────────

_INTENT_PROMPT = """\
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
would answer this question. This becomes the retrieval target.
Example: "The exact text of the post-operative discharge procedure, specifically
the criteria a patient must meet before being released."

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

Return ONLY the JSON. No markdown fences. No preamble.
"""


# ── Result dataclass ───────────────────────────────────────────────────────────

@dataclass
class IntentResult:
    intent_type:  str
    confidence:   float
    entities:     dict                 = field(default_factory=dict)
    search_focus: str                  = ""
    complexity:   str                  = "simple"
    reasoning:    str                  = ""

    # Derived helpers used by the planner.
    @property
    def all_topics(self) -> list[str]:
        return self.entities.get("topics", [])

    @property
    def all_entities_flat(self) -> list[str]:
        """Flat list of all extracted entity values (for metadata filtering)."""
        result = []
        for v in self.entities.values():
            if isinstance(v, list):
                result.extend(v)
        return result

    @property
    def needs_multi_doc(self) -> bool:
        return self.complexity == "complex" or self.intent_type == "COMPARISON"

    @property
    def needs_multi_query(self) -> bool:
        return self.complexity in ("moderate", "complex")


# ── Public function ────────────────────────────────────────────────────────────

def analyse_intent(query: str) -> IntentResult:
    """
    Run the intent agent on a raw user query.

    Parameters
    ----------
    query : Raw user query string.

    Returns
    -------
    IntentResult with structured intent classification and entity extraction.
    Falls back to a default LOOKUP intent if the LLM fails.
    """
    prompt = _INTENT_PROMPT.format(query=query.strip())

    try:
        raw  = call_llm(prompt, expect_json=True)
        data = parse_json_response(raw)

        intent = IntentResult(
            intent_type  = str(data.get("intent_type",  "LOOKUP")).upper(),
            confidence   = float(data.get("confidence",  0.7)),
            entities     = data.get("entities",          {}),
            search_focus = str(data.get("search_focus",  query)),
            complexity   = str(data.get("complexity",    "simple")).lower(),
            reasoning    = str(data.get("reasoning",     "")),
        )

        # Validate intent type.
        valid_intents = {
            "DEFINITION", "PROCEDURE", "LOOKUP", "COMPARISON", "SUMMARISE",
            "EXISTENCE_CHECK", "LIST", "CAUSAL", "CONDITIONAL",
            "PERSON_LOOKUP", "DATE_LOOKUP",
        }
        if intent.intent_type not in valid_intents:
            intent.intent_type = "LOOKUP"

        logger.info(
            "Intent: type=%s  confidence=%.2f  complexity=%s  query=%r",
            intent.intent_type, intent.confidence, intent.complexity, query[:60],
        )
        return intent

    except Exception as exc:
        logger.warning("Intent analysis failed (%s). Using fallback LOOKUP.", exc)
        return IntentResult(
            intent_type  = "LOOKUP",
            confidence   = 0.5,
            search_focus = query,
            complexity   = "simple",
        )