"""
services/query_service.py — Query orchestration service.

Handles both single-document and multi-document query workflows.
The router calls these functions; they coordinate the core retriever
and handle all file-system access (loading tree indexes, reading metadata).

Public surface
--------------
  answer_query(request)  → QueryResponse
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import HTTPException, status

from config import TREE_DIR, DOCS_DIR, MAX_CONTEXT_CHARS
from core.llm import call_llm
from core.retriever import retrieve_and_answer, tree_search
from core.tree import load_tree, create_node_map
from models.schemas import QueryRequest, QueryResponse, SourceCitation
from services.ingestion_service import read_all_meta

logger = logging.getLogger(__name__)

# ── Answer prompt (re-used for multi-document merge) ──────────────────────────
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
#  HELPERS
# =============================================================================

def _resolve_tree_path(doc_id: str) -> Path:
    """
    Return the tree-index path for a given doc_id.

    Raises HTTP 404 if the index does not exist (document not ingested).
    """
    path = TREE_DIR / f"{doc_id}.json"
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No indexed document found for doc_id '{doc_id}'.",
        )
    return path


def _filename_for_doc(doc_id: str) -> str:
    """
    Return the original filename for a doc_id by reading its sidecar meta file.
    Falls back to doc_id if the sidecar is missing.
    """
    import json
    meta_path = TREE_DIR / f"{doc_id}.meta.json"
    try:
        return json.loads(meta_path.read_text(encoding="utf-8")).get("filename", doc_id)
    except Exception:
        return doc_id


def _all_doc_ids() -> list[str]:
    """Return doc_ids for every ingested document (reads TREE_DIR)."""
    return [p.stem for p in sorted(TREE_DIR.glob("*.json"))]


# =============================================================================
#  SINGLE-DOCUMENT QUERY
# =============================================================================

def _query_one(doc_id: str, query: str) -> tuple[str, list[SourceCitation], str]:
    """
    Run the full vectorless RAG pipeline against a single document.

    Returns
    -------
    answer   : Grounded answer string.
    sources  : List of SourceCitation objects with node + document info.
    thinking : LLM reasoning trace from tree search.
    """
    tree_path = _resolve_tree_path(doc_id)
    tree      = load_tree(tree_path)
    filename  = _filename_for_doc(doc_id)
    node_map  = create_node_map(tree)

    answer, node_ids, thinking = retrieve_and_answer(tree, query)

    sources = [
        SourceCitation(
            doc_id   = doc_id,
            node_id  = nid,
            title    = node_map[nid].title,
            filename = filename,
        )
        for nid in node_ids
        if nid in node_map
    ]

    return answer, sources, thinking


# =============================================================================
#  MULTI-DOCUMENT QUERY
# =============================================================================

def _query_all(doc_ids: list[str], query: str) -> tuple[str, list[SourceCitation], str]:
    """
    Search across multiple documents and merge results into one answer.

    Strategy
    --------
    1.  Run tree_search independently on each document.
        (Only tree_search, not retrieve_and_answer, so we can collect and
         merge nodes from all documents before generating a single answer.)
    2.  Collect the selected nodes from every document.
    3.  Concatenate all retrieved sections into one context (capped at
        MAX_CONTEXT_CHARS so we don't blow the context window).
    4.  Generate a single merged answer from the combined context.

    This avoids generating N separate answers and then trying to merge them,
    which would require a second LLM call and introduce stitching errors.
    """
    all_context_parts: list[str]       = []
    all_sources:       list[SourceCitation] = []
    all_thinking:      list[str]       = []

    for doc_id in doc_ids:
        index_path = TREE_DIR / f"{doc_id}.json"
        if not index_path.exists():
            logger.warning("Skipping missing index for doc_id=%s", doc_id)
            continue

        try:
            tree     = load_tree(index_path)
            filename = _filename_for_doc(doc_id)
            node_map = create_node_map(tree)

            node_ids, thinking = tree_search(tree, query)
            all_thinking.append(f"[{filename}]\n{thinking}")

            for nid in node_ids:
                if nid in node_map:
                    all_context_parts.append(node_map[nid].content)
                    all_sources.append(
                        SourceCitation(
                            doc_id   = doc_id,
                            node_id  = nid,
                            title    = node_map[nid].title,
                            filename = filename,
                        )
                    )
        except Exception as exc:
            logger.exception("Error searching doc_id=%s: %s", doc_id, exc)
            continue

    merged_thinking = "\n\n".join(all_thinking) or "No documents could be searched."

    if not all_context_parts:
        return (
            "I could not find this information in the available documents.",
            [],
            merged_thinking,
        )

    # Merge and truncate context, then generate one answer.
    context = "\n\n---\n\n".join(all_context_parts)[:MAX_CONTEXT_CHARS]
    prompt  = _ANSWER_PROMPT.format(query=query, context=context)
    answer  = call_llm(prompt)

    return answer, all_sources, merged_thinking


# =============================================================================
#  PUBLIC SERVICE FUNCTION
# =============================================================================

async def answer_query(request: QueryRequest) -> QueryResponse:
    """
    Route and execute a user query.

    If request.doc_ids is non-empty, search only those documents.
    If request.doc_ids is empty, search ALL ingested documents.

    Parameters
    ----------
    request : Validated QueryRequest (query string + optional doc_id list).

    Returns
    -------
    QueryResponse with answer, sources, and thinking.
    """
    try:
        target_ids = request.doc_ids or _all_doc_ids()

        if not target_ids:
            return QueryResponse(
                status   = "success",
                answer   = "No documents have been ingested yet. Please upload a document first.",
                sources  = [],
                thinking = "",
            )

        # ── Single document: use the optimised single-doc path ────────────────
        if len(target_ids) == 1:
            answer, sources, thinking = _query_one(target_ids[0], request.query)

        # ── Multiple documents: merge-search path ─────────────────────────────
        else:
            answer, sources, thinking = _query_all(target_ids, request.query)

        logger.info(
            "Query complete: query_len=%d  docs=%d  sources=%d",
            len(request.query), len(target_ids), len(sources),
        )

        return QueryResponse(
            status   = "success",
            answer   = answer,
            sources  = sources,
            thinking = thinking,
        )

    except HTTPException:
        raise   # pass through 404s from _resolve_tree_path

    except Exception as exc:
        logger.exception("Query service error: query=%r", request.query[:60])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing your query. Please try again.",
        ) from exc