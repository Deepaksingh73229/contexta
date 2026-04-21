"""
core/builder.py — Document → TreeNode hierarchy construction.

This module owns the entire "build" half of the pipeline:

    Source file (PDF / MD / TXT)
         ↓  load_document_as_markdown()
    Markdown string
         ↓  build_tree()
    TreeNode hierarchy
         ↓  summarize_tree()
    TreeNode hierarchy with summaries on every node

Nothing in this file touches FastAPI, HTTP, or disk I/O beyond reading the
source document.  That makes the logic fully testable in isolation and
reusable from scripts, notebooks, or CLI tools without starting a server.

Public surface
--------------
  load_document_as_markdown(path) → str
  build_tree(markdown)            → TreeNode
  summarize_tree(node)            → None   (mutates nodes in place)
"""

from __future__ import annotations

import logging
import re

from langchain_text_splitters import MarkdownHeaderTextSplitter

from config import MAX_SUMMARY_CHARS
from core.llm import call_llm
from core.tree import TreeNode

logger = logging.getLogger(__name__)

# Optional dependency — only needed for PDF ingestion.
try:
    import pymupdf4llm
    _PYMUPDF_AVAILABLE = True
except ImportError:
    _PYMUPDF_AVAILABLE = False

# =============================================================================
#  HEADER DEPTH MAP
# =============================================================================

# Maps the metadata keys produced by MarkdownHeaderTextSplitter to integer
# depth levels used by the stack algorithm in build_tree.
#   depth 1 → #   (document-level heading)
#   depth 2 → ##  (section)
#   depth 3 → ### (subsection)
_HEADER_LEVELS: dict[str, int] = {
    "title":      1,
    "section":    2,
    "subsection": 3,
}

# =============================================================================
#  PROMPTS
# =============================================================================

_SUMMARY_PROMPT = """\
Summarize the following document section in 2-3 sentences.
State only facts found in the text.
Do NOT start with phrases like "Here is a summary" or "This section covers".

Section title: {title}

Section content:
{content}
"""

# =============================================================================
#  DOCUMENT LOADING
# =============================================================================

def load_document_as_markdown(source_path) -> str:
    """
    Return the full Markdown text of a source document.

    Supported formats
    -----------------
    .pdf  → Converted to Markdown via pymupdf4llm (wraps PyMuPDF, fully
             offline C library).  Preserves headings, tables, and lists.
             Inserts <!-- page_break --> between pages, which build_tree
             strips harmlessly.
    .md   → Read directly; assumed to already be well-structured Markdown.
    .txt  → Read as plain text.  Will be treated as a single flat section
             if no Markdown headers are present.

    Parameters
    ----------
    source_path : pathlib.Path or str — path to the source file.

    Raises
    ------
    RuntimeError  : If pymupdf4llm is not installed and a .pdf is requested.
    ValueError    : If the file extension is not supported.
    FileNotFoundError : If source_path does not exist.
    """
    from pathlib import Path
    source_path = Path(source_path)

    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")

    suffix = source_path.suffix.lower()

    if suffix == ".pdf":
        if not _PYMUPDF_AVAILABLE:
            raise RuntimeError(
                "pymupdf4llm is required for PDF ingestion but is not installed.\n"
                "Install it:  pip install pymupdf4llm"
            )
        logger.info("Converting PDF → Markdown: %s", source_path.name)
        # page_chunks=False → single Markdown string with <!-- page_break --> markers.
        return pymupdf4llm.to_markdown(str(source_path), page_chunks=False)

    if suffix in (".md", ".txt"):
        logger.info("Reading text file: %s", source_path.name)
        return source_path.read_text(encoding="utf-8")

    raise ValueError(
        f"Unsupported file extension: '{suffix}'.  "
        f"Supported: .pdf  .md  .txt"
    )


# =============================================================================
#  PHASE 1 — BUILD TREE
# =============================================================================

def build_tree(markdown: str) -> TreeNode:
    """
    Parse a Markdown string into a hierarchical TreeNode tree.

    Algorithm
    ---------
    1.  Strip page-break HTML comments inserted by pymupdf4llm.
    2.  Run MarkdownHeaderTextSplitter to divide the document at every
        #, ##, and ### heading.  Each resulting Document carries metadata
        recording which heading levels surrounded it.
    3.  Walk the list of sections in document order, maintaining a *stack*
        of (depth, TreeNode) pairs that tracks the current ancestry path.

        For each section:
          a.  Read the deepest header key in its metadata → own_level.
          b.  Unwind the stack: pop entries until the stack top is shallower
              than own_level.  The top is now the correct parent.
          c.  Create a new TreeNode with a sequential zero-padded ID.
          d.  Append it to the parent's .nodes list.
          e.  Push it onto the stack.

        Sections with no header key (preamble text) are appended to root.content.

    Returns
    -------
    The root TreeNode.  Its `nodes` list holds all top-level sections,
    each of which recursively holds sub-sections.

    Example (hospital policy document)
    -----------------------------------
    # Patient Care                      → depth 1, node 0001
    ## Discharge Procedures             → depth 2, node 0002 (child of 0001)
    ### Post-Surgery Release            → depth 3, node 0003 (child of 0002)
    ## Medication Administration        → depth 2, node 0004 (child of 0001)
    # Administration                    → depth 1, node 0005
    """

    # Step 1 — normalise page-break markers to plain newlines.
    text = markdown.replace("<!-- page_break -->", "\n")

    # Step 2 — split at Markdown headers.
    # strip_headers=False keeps the header line (e.g. "## Discharge") inside
    # page_content so each node's content is self-contained.
    splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[
            ("#",   "title"),
            ("##",  "section"),
            ("###", "subsection"),
        ],
        strip_headers=False,
    )
    sections = splitter.split_text(text)

    # Step 3 — build tree with a depth-tracking stack.
    root    = TreeNode(title="Document", node_id="0000", content="")
    counter = 1                                          # ID counter (root = 0000)
    stack: list[tuple[int, TreeNode]] = [(0, root)]     # [(depth, node), ...]

    for section in sections:
        # Determine the depth of this section.
        # The splitter sets metadata keys for every header level that enclosed
        # the section.  We want the *deepest* key — the section's own header.
        own_level     = 0
        section_title = "Untitled"

        for key in ("title", "section", "subsection"):
            if key in section.metadata:
                own_level     = _HEADER_LEVELS[key]
                section_title = section.metadata[key]

        # No header → preamble text before the first heading.
        if own_level == 0:
            root.content += section.page_content
            continue

        # Create the new node.
        node = TreeNode(
            title   = section_title,
            node_id = f"{counter:04}",
            content = section.page_content,
        )
        counter += 1

        # Unwind the stack until the top entry is shallower than this node.
        # After unwinding, stack[-1] is the correct parent.
        #
        # Example:  stack = [(0,root),(1,chap),(2,sec),(3,sub)]
        # New node at depth 2 → pop (3,sub) and (2,sec) → parent is (1,chap).
        while len(stack) > 1 and stack[-1][0] >= own_level:
            stack.pop()

        # Attach to parent and push self for future children.
        stack[-1][1].nodes.append(node)
        stack.append((own_level, node))

    logger.info("Tree built: %d nodes from %d characters", root.node_count(), len(markdown))
    return root


# =============================================================================
#  PHASE 2 — SUMMARISE TREE  (bottom-up)
# =============================================================================

def _has_meaningful_content(text: str) -> bool:
    """
    Return True if `text` contains more than a bare Markdown header line.

    The regex removes every line that starts with # characters followed by
    a space (i.e. every Markdown heading).  If what remains is longer than
    20 characters the node has real prose worth summarising.

    Bug fixed from original: `re.MULTLINE` (typo) → `re.MULTILINE`.
    """
    stripped = re.sub(r"^#+\s+.*$", "", text, flags=re.MULTILINE).strip()
    return len(stripped) > 20


def summarize_tree(node: TreeNode) -> None:
    """
    Recursively generate LLM summaries for every node, bottom-up (post-order).

    Why bottom-up?
    --------------
    Child summaries are available before their parent is summarised.
    Each parent therefore summarises *what its children cover* in addition
    to its own prose, producing a rich hierarchical index:

        leaf summary
            → section summary  (includes leaf summaries as bullet list)
            → chapter summary  (includes section summaries)
            → document summary (includes chapter summaries)

    A chapter's summary will mention "subsection A covers X, subsection B
    covers Y" so the search LLM can route queries accurately without reading
    any raw text.

    Skip strategy
    -------------
    Nodes with neither meaningful own prose nor children with summaries are
    skipped to avoid wasting LLM calls on purely structural header nodes.

    Content composition
    -------------------
    +---------------------+-------------------------------+---------------------------+
    | has_content         | has_child_summaries           | text sent to summary LLM  |
    +---------------------+-------------------------------+---------------------------+
    | True                | False (leaf)                  | node.content              |
    | False               | True  (structural parent)     | children bullet list      |
    | True                | True  (parent with own prose) | content + children list   |
    | False               | False (empty)                 | SKIP                      |
    +---------------------+-------------------------------+---------------------------+
    """

    # Recurse into children first (post-order / bottom-up).
    for child in node.nodes:
        summarize_tree(child)

    has_content        = _has_meaningful_content(node.content)
    has_child_summaries = any(child.summary for child in node.nodes)

    if not has_content and not has_child_summaries:
        return   # nothing meaningful here — skip the LLM call

    # Compose the text the LLM will summarise.
    if has_child_summaries:
        # Build a bullet list of each child's title and summary.
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
    prompt       = _SUMMARY_PROMPT.format(title=node.title, content=text[:MAX_SUMMARY_CHARS])
    node.summary = call_llm(prompt)