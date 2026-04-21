"""
core/retriever.py — Tree search and answer generation.

This module owns the entire "query" half of the pipeline:

    User query
         ↓  tree_search()
    List of relevant node_ids  (LLM reasons over compact tree index)
         ↓  retrieve_and_answer()
    Grounded answer + citation list

Nothing in this file touches FastAPI, disk I/O, or document parsing.
The only inputs are a loaded TreeNode tree and a query string.

Public surface
--------------
  tree_search(tree, query)           → (node_ids, thinking)
  retrieve_and_answer(tree, query)   → (answer, node_ids, thinking)
"""

from __future__ import annotations

import json
import logging

from config import MAX_CONTEXT_CHARS
from core.llm import call_llm, parse_json_response
from core.tree import TreeNode, create_node_map

logger = logging.getLogger(__name__)

# =============================================================================
#  PROMPTS
# =============================================================================

# The tree-search prompt receives the compact tree index (titles + summaries,
# NO raw content).  We request strict JSON so the response can be parsed
# reliably without a schema-enforcing library.
_TREE_SEARCH_PROMPT = """\
You are a document retrieval assistant for an institutional knowledge base.
You will receive a question and a hierarchical tree index of a document.
Each node in the tree has a node_id, a title, and a short summary of its content.

Your task:
1. Think step by step about which sections are most likely to contain the answer.
2. Return a JSON object with EXACTLY two keys:
   - "thinking"  : your step-by-step reasoning as a single string
   - "node_list" : a JSON array of node_id strings, e.g. ["0003", "0007"]

Return ONLY the JSON object. Do not include any text outside the JSON.
Do not wrap the JSON in markdown code fences.

Question: {query}

Document tree index:
{tree_index}
"""

# The answer prompt receives raw section content from the retrieved nodes.
# It mirrors the Contexta system-prompt philosophy from chat.py:
# ground the answer strictly in provided context; never fabricate.
_ANSWER_PROMPT = """\
You are Contexta, a precise institutional knowledge assistant.
Answer the question using ONLY the document excerpts provided below.
Do NOT use any knowledge from your training data.

Rules:
1. If the answer is present, state it concisely and factually.
2. If the answer cannot be found in the excerpts, respond with exactly:
   "I could not find this information in the available documents."
3. Do not guess. Do not apologise at length. Do not add filler phrases.

Question: {query}

Document excerpts:
{context}

Answer:
"""

# =============================================================================
#  PHASE 3 — TREE SEARCH
# =============================================================================

def tree_search(tree: TreeNode, query: str) -> tuple[list[str], str]:
    """
    Ask the local LLM which tree nodes are relevant to the query.

    The LLM receives the *compact* tree index — only node_id, title, and
    summary for every node.  Raw section content is deliberately excluded to
    keep the prompt small and within the context window.

    Why LLM reasoning instead of vector similarity?
    ------------------------------------------------
    A small local embedding model may miss paraphrase and domain-specific
    vocabulary.  For example:

        Query:    "patient discharge after surgery"
        Section:  "Post-Operative Release Procedures"

    Cosine similarity between these strings on a 4B-parameter embedding model
    would likely be low.  An LLM, even a 4B model, understands that "discharge"
    and "release" are synonymous in this context.

    Parameters
    ----------
    tree  : Root TreeNode (summaries must already be populated).
    query : Natural-language question from the user.

    Returns
    -------
    node_ids : List of node_id strings the LLM identified as relevant.
    thinking : The LLM's chain-of-thought reasoning (for auditability /
               transparency; logged and returned to the caller but not shown
               to end users unless explicitly requested).
    """
    # Build the compact index: titles + summaries, NO content.
    tree_index_dict = tree.to_dict(include_content=False)
    tree_index_json = json.dumps(tree_index_dict, indent=2, ensure_ascii=False)

    prompt   = _TREE_SEARCH_PROMPT.format(query=query, tree_index=tree_index_json)
    raw      = call_llm(prompt, expect_json=True)

    try:
        data     = parse_json_response(raw)
        thinking = str(data.get("thinking", "No reasoning provided."))
        node_ids = [str(nid) for nid in data.get("node_list", [])]
    except Exception as exc:
        logger.warning("Tree-search JSON parse failed (%s). Raw: %.200s", exc, raw)
        thinking = f"Parse failed — raw LLM output: {raw[:300]}"
        node_ids = []

    logger.info(
        "Tree search: query=%r → nodes=%s",
        query[:60],
        node_ids,
    )
    return node_ids, thinking


# =============================================================================
#  PHASE 4 — RETRIEVE AND ANSWER
# =============================================================================

def retrieve_and_answer(
    tree: TreeNode,
    query: str,
) -> tuple[str, list[str], str]:
    """
    Full vectorless RAG pipeline: tree search → content retrieval → answer.

    Steps
    -----
    1.  Flatten tree → O(1) node map (avoids repeated tree traversal).
    2.  Call tree_search: the LLM selects relevant node IDs by reasoning
        over the compact index (titles + summaries only — no raw content yet).
    3.  Retrieve the raw content of each selected node.
        Guard against hallucinated IDs with `if nid in node_map`.
    4.  Concatenate retrieved sections into a context string, separated by
        horizontal rules for readability.  Truncate to MAX_CONTEXT_CHARS.
    5.  Send the context + query to the LLM for grounded answer generation.

    Parameters
    ----------
    tree  : Root TreeNode (with summaries populated by summarize_tree).
    query : Natural-language question from the user.

    Returns
    -------
    answer   : The LLM's grounded answer string.
    node_ids : The node IDs used for retrieval (for transparency / citation).
    thinking : The LLM's reasoning trace from tree_search.
    """
    node_map = create_node_map(tree)

    # ── Phase 3 ──────────────────────────────────────────────────────────────
    node_ids, thinking = tree_search(tree, query)

    if not node_ids:
        logger.warning("Tree search returned no nodes for query: %r", query[:60])
        return (
            "I could not find this information in the available documents.",
            [],
            thinking,
        )

    # ── Content retrieval ─────────────────────────────────────────────────────
    # Only keep IDs that actually exist in the tree (guards against LLM hallucination).
    valid_ids = [nid for nid in node_ids if nid in node_map]

    if not valid_ids:
        logger.warning("All returned node IDs were invalid: %s", node_ids)
        return (
            "I could not find this information in the available documents.",
            node_ids,
            thinking,
        )

    # Join the raw content of each retrieved section.
    # "---" separators make it clear to the LLM where one section ends and
    # the next begins, reducing context confusion.
    context_parts = [node_map[nid].content for nid in valid_ids]
    context       = "\n\n---\n\n".join(context_parts)[:MAX_CONTEXT_CHARS]

    # ── Phase 4: Answer generation ────────────────────────────────────────────
    prompt = _ANSWER_PROMPT.format(query=query, context=context)
    answer = call_llm(prompt)

    logger.info("Answer generated for query: %r", query[:60])
    return answer, valid_ids, thinking