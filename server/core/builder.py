"""
core/builder.py — Document → TreeNode hierarchy + summarisation + embedding.

Enterprise additions vs original:
  1. Richer summary prompt — includes key topics, entities, and searchable keywords.
  2. embed_tree() step — after summarisation, embed every node's summary for FAISS.
  3. _has_meaningful_content bug fix: re.MULTILINE (was re.MULTLINE in original).

Public surface
--------------
  load_document_as_markdown(path)  → str
  build_tree(markdown)             → TreeNode
  summarize_tree(node)             → None   (mutates nodes in place)
  embed_tree(node)                 → None   (mutates node.embedding in place)
"""

from __future__ import annotations

import logging
import re

from langchain_text_splitters import MarkdownHeaderTextSplitter

from config import MAX_SUMMARY_CHARS
from core.llm import call_llm
from core.tree import TreeNode

logger = logging.getLogger(__name__)

try:
    import pymupdf4llm
    _PYMUPDF_AVAILABLE = True
except ImportError:
    _PYMUPDF_AVAILABLE = False

_HEADER_LEVELS: dict[str, int] = {
    "title":      1,
    "section":    2,
    "subsection": 3,
}

# ── Richer summary prompt (enterprise upgrade #7) ─────────────────────────────
# Original: "Summarize in 2-3 sentences."
# Enterprise: structured output that improves BM25 keyword recall AND embedding quality.
_SUMMARY_PROMPT = """\
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
{content}
"""

_SUMMARY_PROMPT_FALLBACK = """\
Summarize the following document section in 2-3 sentences.
State only facts found in the text. Include important technical terms and entity names.
Do NOT begin with "Here is a summary" or similar preamble.

Section title: {title}

Section content:
{content}
"""


# ── Document loading ───────────────────────────────────────────────────────────

def load_document_as_markdown(source_path) -> str:
    from pathlib import Path
    source_path = Path(source_path)

    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")

    suffix = source_path.suffix.lower()

    if suffix == ".pdf":
        if not _PYMUPDF_AVAILABLE:
            raise RuntimeError(
                "pymupdf4llm is required for PDF ingestion.\n"
                "Install: pip install pymupdf4llm --break-system-packages"
            )
        logger.info("Converting PDF → Markdown: %s", source_path.name)
        return pymupdf4llm.to_markdown(str(source_path), page_chunks=False)

    if suffix in (".md", ".txt"):
        logger.info("Reading text file: %s", source_path.name)
        return source_path.read_text(encoding="utf-8")

    raise ValueError(f"Unsupported file extension: '{suffix}'. Supported: .pdf .md .txt")


# ── Phase 1: Build tree ────────────────────────────────────────────────────────

def build_tree(markdown: str) -> TreeNode:
    """Parse a Markdown string into a hierarchical TreeNode tree."""
    text = markdown.replace("<!-- page_break -->", "\n")

    splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[
            ("#",   "title"),
            ("##",  "section"),
            ("###", "subsection"),
        ],
        strip_headers=False,
    )
    sections = splitter.split_text(text)

    root    = TreeNode(title="Document", node_id="0000", content="")
    counter = 1
    stack: list[tuple[int, TreeNode]] = [(0, root)]

    for section in sections:
        own_level     = 0
        section_title = "Untitled"
        for key in ("title", "section", "subsection"):
            if key in section.metadata:
                own_level     = _HEADER_LEVELS[key]
                section_title = section.metadata[key]

        if own_level == 0:
            root.content += section.page_content
            continue

        node = TreeNode(
            title   = section_title,
            node_id = f"{counter:04}",
            content = section.page_content,
        )
        counter += 1

        while len(stack) > 1 and stack[-1][0] >= own_level:
            stack.pop()

        stack[-1][1].nodes.append(node)
        stack.append((own_level, node))

    logger.info("Tree built: %d nodes from %d characters", root.node_count(), len(markdown))
    return root


# ── Phase 2: Summarise tree ────────────────────────────────────────────────────

def _has_meaningful_content(text: str) -> bool:
    """Return True if text has more than a bare Markdown header."""
    stripped = re.sub(r"^#+\s+.*$", "", text, flags=re.MULTILINE).strip()  # BUG FIX: MULTLINE→MULTILINE
    return len(stripped) > 20


def summarize_tree(node: TreeNode) -> None:
    """
    Recursively generate structured LLM summaries for every node, bottom-up.

    Enterprise change: the richer _SUMMARY_PROMPT includes key topics, entities,
    and keywords — dramatically improving both BM25 recall and embedding quality.
    """
    for child in node.nodes:
        summarize_tree(child)

    has_content        = _has_meaningful_content(node.content)
    has_child_summaries = any(child.summary for child in node.nodes)

    if not has_content and not has_child_summaries:
        return

    if has_child_summaries:
        children_text = "\n".join(
            f"- {child.title}: {child.summary}"
            for child in node.nodes
            if child.summary
        )
        text = (
            f"{node.content}\n\nChild sections:\n{children_text}"
            if has_content
            else children_text
        )
    else:
        text = node.content

    logger.debug("Summarising node %s: %s", node.node_id, node.title)

    # Try rich structured prompt; fall back to simple if it fails.
    try:
        prompt       = _SUMMARY_PROMPT.format(title=node.title, content=text[:MAX_SUMMARY_CHARS])
        node.summary = call_llm(prompt)
    except Exception:
        prompt       = _SUMMARY_PROMPT_FALLBACK.format(title=node.title, content=text[:MAX_SUMMARY_CHARS])
        node.summary = call_llm(prompt)


# ── Phase 3: Embed tree (enterprise addition) ──────────────────────────────────

def embed_tree(node: TreeNode) -> None:
    """
    Embed every node's summary in-place using the offline sentence-transformer.

    This is called AFTER summarize_tree().  Each node's .embedding is set to a
    float vector of length EMBEDDING_DIM (384 for bge-small-en).

    Strategy: batch all summaries in one encode() call for efficiency.
    """
    from core.embeddings import embed_batch

    all_nodes = node.all_nodes()
    # Only embed nodes that have a summary and haven't been embedded yet.
    to_embed   = [n for n in all_nodes if n.summary and not n.embedding]
    if not to_embed:
        logger.info("embed_tree: all nodes already embedded or no summaries.")
        return

    texts      = [n.summary for n in to_embed]
    embeddings = embed_batch(texts)

    for n, vec in zip(to_embed, embeddings):
        n.embedding = vec

    logger.info("Embedded %d nodes.", len(to_embed))