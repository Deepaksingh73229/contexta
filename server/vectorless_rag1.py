"""
vectorless_rag.py  —  Fully Offline Vectorless RAG Pipeline
============================================================

Architecture
------------
Instead of embedding documents into a vector database, this pipeline converts
every document into a *hierarchical tree* of sections.  Each node in the tree
stores the raw text of one section plus a short LLM-generated summary.

At query time the LLM reads only the compact index (titles + summaries, no raw
text) and reasons about which nodes are relevant.  Only the selected nodes'
raw content is then passed to the answer-generation step.

This approach:
  • Requires NO vector database, NO embedding model, NO internet connection.
  • Runs entirely on a local Ollama LLM (e.g. llama3, mistral, gemma, phi3).
  • Produces transparent, traceable retrieval with a human-readable reasoning log.
  • Handles both PDF and plain-Markdown source documents.

Offline dependencies (install via pip, no internet needed after first install):
  pip install ollama langchain-text-splitters pymupdf4llm pydantic rich

Ollama models must be pulled once while online:
  ollama pull llama3          # or mistral / gemma:4b / phi3 / any GGUF model

Usage
-----
Run as a standalone CLI:
    python vectorless_rag.py --doc path/to/file.pdf --query "What is the policy?"

Import as a library:
    from vectorless_rag import ingest_document, query_document

Directory layout produced:
    tree_indexes/
        <doc_id>.json      ← hierarchical tree index (titles + summaries + content)
    documents/
        <doc_id>.pdf       ← original file kept for citation
"""

from __future__ import annotations

# ── Standard Library ───────────────────────────────────────────────────────────
import argparse
import json
import logging
import re
import sys
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ── Third-party (all offline) ──────────────────────────────────────────────────
try:
    import pymupdf4llm                          # PDF → Markdown (local, no API)
except ImportError:
    pymupdf4llm = None                          # graceful fallback for .md files

from langchain_text_splitters import MarkdownHeaderTextSplitter
from pydantic import BaseModel, Field
import ollama                                   # direct Ollama client — no LangChain server
from rich.console import Console
from rich.panel import Panel
from rich.tree import Tree as RichTree

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("vectorless_rag")

# ── Console (Rich) ─────────────────────────────────────────────────────────────
console = Console()

# ── Paths ──────────────────────────────────────────────────────────────────────
_BASE_DIR: Path = Path(__file__).resolve().parent
TREE_DIR:  Path = _BASE_DIR / "tree_indexes"   # where JSON indexes live
DOCS_DIR:  Path = _BASE_DIR / "documents"      # permanent copy of source files

TREE_DIR.mkdir(parents=True, exist_ok=True)
DOCS_DIR.mkdir(parents=True, exist_ok=True)

# ── Ollama model ───────────────────────────────────────────────────────────────
# Change this to any model you have pulled locally.
# Recommended: llama3, mistral, phi3, gemma:4b
# Larger models give better summaries and search; smaller are faster.
OLLAMA_MODEL: str = "llama3"

# Maximum characters sent to the LLM in a single prompt.
# Keep below the model's context window (tokens ≈ chars / 4).
MAX_SUMMARY_CHARS: int = 5_000
MAX_CONTEXT_CHARS: int = 8_000


# =============================================================================
#  DATA STRUCTURES
# =============================================================================

@dataclass
class TreeNode:
    """
    One node in the document hierarchy.

    A node maps to one section in the source document (e.g. one ## heading).
    Its `nodes` list holds all immediate sub-sections.

    Fields
    ------
    title    : section heading text extracted from the Markdown header.
    node_id  : zero-padded 4-digit string ("0001", "0042").  Stable identifier
               used by the LLM to reference sections during tree search.
    content  : full raw Markdown text of this section (including the header
               line), as produced by MarkdownHeaderTextSplitter.
    summary  : 2-3 sentence LLM-generated description.  Empty until
               summarize_tree() is called.
    nodes    : child TreeNode objects (sub-sections).
    """

    title:   str
    node_id: str
    content: str
    summary: str = ""
    nodes:   list["TreeNode"] = field(default_factory=list)

    # ------------------------------------------------------------------
    def to_dict(self, include_content: bool = True) -> dict:
        """
        Serialise to a plain Python dict (JSON-compatible).

        When include_content=False the raw section text is omitted.
        This produces the lightweight "tree index" that is sent to the LLM
        during tree search — keeping the prompt small while still providing
        enough information (title + summary) for relevance reasoning.
        """
        result: dict = {
            "title":   self.title,
            "node_id": self.node_id,
            "summary": self.summary,
        }
        if include_content:
            result["content"] = self.content
        if self.nodes:
            result["nodes"] = [n.to_dict(include_content) for n in self.nodes]
        return result

    # ------------------------------------------------------------------
    def node_count(self) -> int:
        """Total number of nodes in the subtree rooted at this node."""
        return 1 + sum(child.node_count() for child in self.nodes)


# =============================================================================
#  STRUCTURED OUTPUT SCHEMA
# =============================================================================

class TreeSearchResult(BaseModel):
    """
    Schema for the LLM's tree-search response.

    We ask the LLM to respond in JSON that matches this schema.
    `thinking` captures the chain-of-thought so humans can audit the retrieval.
    `node_list` is the list of node_id strings the LLM selected as relevant.
    """
    thinking:  str       = Field(description="Step-by-step reasoning about which nodes are relevant")
    node_list: list[str] = Field(description="List of relevant node_id strings")


# =============================================================================
#  HEADER DEPTH MAP
# =============================================================================

# Maps the metadata keys returned by MarkdownHeaderTextSplitter to integer
# depths.  Depth 1 = top-level heading (#), depth 3 = subsection (###).
HEADER_LEVELS: dict[str, int] = {
    "title":      1,   # #
    "section":    2,   # ##
    "subsection": 3,   # ###
}


# =============================================================================
#  PROMPT TEMPLATES
# =============================================================================

SUMMARY_PROMPT = """\
Summarize the following document section in 2-3 sentences.
State only facts found in the text. Do NOT begin with "Here is a summary" or similar preamble.

Section title: {title}

Section content:
{content}
"""

# NOTE: we ask for strict JSON so we can parse it without a schema-enforcing library.
TREE_SEARCH_PROMPT = """\
You are a document retrieval assistant.
You are given a question and a hierarchical tree index of a document.
Each tree node has a node_id, a title, and a summary of that section's content.

Your task:
1. Think step by step about which sections are most likely to contain the answer.
2. Return your answer as a JSON object with exactly two keys:
   - "thinking": your reasoning as a string
   - "node_list": a JSON array of node_id strings you selected (e.g. ["0003", "0007"])

Return ONLY the JSON object. Do not wrap it in markdown code fences.

Question: {query}

Document tree index:
{tree_index}
"""

ANSWER_PROMPT = """\
Answer the question using ONLY the document excerpts provided below.
If the answer cannot be found in the excerpts, respond with exactly:
"I could not find this information in the available documents."

Question: {query}

Document excerpts:
{context}

Answer:
"""


# =============================================================================
#  LOCAL LLM HELPERS  (100% offline via Ollama)
# =============================================================================

def _call_llm(prompt: str, *, expect_json: bool = False) -> str:
    """
    Send a prompt to the local Ollama model and return the text response.

    Parameters
    ----------
    prompt      : The full prompt string.
    expect_json : If True, instructs Ollama to use JSON output mode, which
                  forces the model to return valid JSON (supported by most
                  recent Ollama models).  Falls back gracefully if unsupported.

    Returns
    -------
    The raw text content of the model's first response message.

    Why not LangChain here?
    -----------------------
    LangChain's Ollama integration adds a network call to a local HTTP server
    and requires langchain_ollama to be installed.  The `ollama` Python package
    talks directly to the Ollama daemon via its REST API (localhost:11434) — no
    cloud, no external network, no API key.
    """
    kwargs: dict = {
        "model":   OLLAMA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "options": {
            "temperature": 0.1,      # near-deterministic for factual tasks
            "seed":        42,       # reproducible outputs across runs
            "num_ctx":     16384,    # context window (tokens); adjust to your model
        },
    }

    # JSON mode: forces the model to emit valid JSON.
    # Supported by llama3, mistral, phi3, gemma as of Ollama ≥ 0.1.28.
    if expect_json:
        kwargs["format"] = "json"

    try:
        response = ollama.chat(**kwargs)
        return response["message"]["content"].strip()
    except Exception as exc:
        logger.error("Ollama call failed: %s", exc)
        raise RuntimeError(
            f"Could not reach Ollama.  Is '{OLLAMA_MODEL}' pulled and Ollama running?\n"
            f"  Run: ollama pull {OLLAMA_MODEL}\n"
            f"  Then: ollama serve"
        ) from exc


def _parse_tree_search_json(raw: str) -> TreeSearchResult:
    """
    Robustly parse the LLM's JSON tree-search response into a TreeSearchResult.

    The LLM occasionally wraps the JSON in markdown code fences (```json ... ```)
    despite instructions not to.  We strip those fences before parsing.
    If parsing fails entirely, we return a safe fallback (empty node list).
    """
    # Strip markdown code fences if present.
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("```").strip()

    try:
        data = json.loads(cleaned)
        return TreeSearchResult(
            thinking  = str(data.get("thinking", "No reasoning provided.")),
            node_list = [str(nid) for nid in data.get("node_list", [])],
        )
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.warning("Could not parse tree-search JSON (%s). Falling back to empty result.", exc)
        return TreeSearchResult(
            thinking  = f"JSON parse failed on raw output: {raw[:200]}",
            node_list = [],
        )


# =============================================================================
#  DOCUMENT → MARKDOWN CONVERSION  (fully offline)
# =============================================================================

def _pdf_to_markdown(pdf_path: Path) -> str:
    """
    Convert a PDF file to Markdown using pymupdf4llm.

    pymupdf4llm wraps PyMuPDF (a C library, no internet needed) and converts
    PDF pages into clean Markdown — preserving headings, tables, and lists —
    with optional page-break markers.

    Raises RuntimeError if pymupdf4llm is not installed.
    """
    if pymupdf4llm is None:
        raise RuntimeError(
            "pymupdf4llm is required for PDF ingestion.\n"
            "Install it offline: pip install pymupdf4llm"
        )
    # page_chunks=False → single Markdown string with <!-- page_break --> markers
    return pymupdf4llm.to_markdown(str(pdf_path), page_chunks=False)


def load_document_as_markdown(source_path: Path) -> str:
    """
    Return the Markdown representation of a document.

    Supports:
      .pdf  → converted via pymupdf4llm (offline)
      .md   → read directly as-is
      .txt  → read as plain text (treated as unstructured Markdown)
    """
    suffix = source_path.suffix.lower()

    if suffix == ".pdf":
        console.print(f"[dim]Converting PDF to Markdown: {source_path.name}[/dim]")
        return _pdf_to_markdown(source_path)

    if suffix in (".md", ".txt"):
        return source_path.read_text(encoding="utf-8")

    raise ValueError(
        f"Unsupported file type: '{suffix}'.  Supported types: .pdf, .md, .txt"
    )


# =============================================================================
#  PHASE 1 — BUILD TREE
# =============================================================================

def build_tree(markdown: str) -> TreeNode:
    """
    Parse a Markdown string into a hierarchical TreeNode tree.

    Algorithm
    ---------
    1. Replace page-break comments with newlines so they do not disrupt
       section boundaries.
    2. Use MarkdownHeaderTextSplitter to split the document at every
       #, ##, and ### heading.  Each split produces a Document object
       whose metadata contains which heading levels were encountered.
    3. Walk the split sections in order.  Maintain a stack of
       (depth, TreeNode) pairs that tracks the current "ancestry path".
       For each section:
         a. Determine its depth (1, 2, or 3) from the metadata.
         b. Unwind the stack until the top entry is shallower than the
            current section (finding the correct parent).
         c. Create a new TreeNode and attach it as a child of the current
            stack top.
         d. Push the new node onto the stack.

    Parameters
    ----------
    markdown : Full Markdown text of the document.

    Returns
    -------
    The root TreeNode.  Its `nodes` list holds all top-level sections,
    which recursively hold sub-sections.
    """

    # Step 1 — normalise page-break markers
    text = markdown.replace("<!-- page_break -->", "\n")

    # Step 2 — split at headers
    # strip_headers=False keeps the header line inside page_content,
    # making each node's content self-contained (readable without context).
    splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[
            ("#",   "title"),
            ("##",  "section"),
            ("###", "subsection"),
        ],
        strip_headers=False,
    )
    sections = splitter.split_text(text)

    # Step 3 — build tree
    # Root node (depth 0) is a sentinel; preamble text before the first
    # heading is appended directly to root.content.
    root    = TreeNode(title="Document", node_id="0000", content="")
    counter = 1
    stack: list[tuple[int, TreeNode]] = [(0, root)]

    for section in sections:
        # Determine the depth of this section from its metadata.
        # The splitter adds keys for every header level that encompasses
        # the section.  We want the *deepest* one — the section's own heading.
        own_level     = 0
        section_title = "Untitled"

        for key in ["title", "section", "subsection"]:
            if key in section.metadata:
                own_level     = HEADER_LEVELS[key]
                section_title = section.metadata[key]

        # No heading found → preamble text; attach to root.
        if own_level == 0:
            root.content += section.page_content
            continue

        # Create the new node with a sequential, zero-padded ID.
        node = TreeNode(
            title   = section_title,
            node_id = f"{counter:04}",
            content = section.page_content,
        )
        counter += 1

        # Unwind stack: pop entries whose depth is >= current section's depth.
        # After unwinding, stack[-1] is the correct parent.
        # Example:  stack = [(0,root),(1,chap),(2,sec),(3,subsec)]
        #           new section at depth 2 → pop subsec and sec → parent is chap.
        while len(stack) > 1 and stack[-1][0] >= own_level:
            stack.pop()

        # Attach to parent and push self.
        stack[-1][1].nodes.append(node)
        stack.append((own_level, node))

    return root


# =============================================================================
#  PHASE 2 — SUMMARISE TREE  (bottom-up)
# =============================================================================

def _has_meaningful_content(text: str) -> bool:
    """
    Return True if `text` contains more than just a Markdown header line.

    The regex removes every line that starts with one or more '#' characters
    followed by a space (i.e. any Markdown heading).  If the remaining text
    is longer than 20 characters, the node has real prose content.

    Bug fix: the original code had `re.MULTLINE` (typo).
    Correct flag is `re.MULTILINE`.
    """
    stripped = re.sub(r"^#+\s+.*$", "", text, flags=re.MULTILINE).strip()
    return len(stripped) > 20


def summarize_tree(node: TreeNode) -> None:
    """
    Recursively generate LLM summaries for every node, bottom-up.

    Bottom-up order means child summaries are ready before their parent
    is summarised.  This allows parent nodes to incorporate their children's
    summaries, producing rich hierarchical descriptions:

        leaf summary → section summary (includes leaf summaries)
                     → chapter summary (includes section summaries)

    Skip strategy:
      - Nodes with neither meaningful own content nor children with summaries
        are skipped entirely (e.g. purely structural header nodes).
      - This avoids wasting LLM calls on empty nodes.

    Content composition:
      - Leaf with content only          → summarise content directly.
      - Parent with children + content  → summarise content + child bullet list.
      - Parent with children only       → summarise child bullet list.
    """

    # Recurse into children first (post-order traversal).
    for child in node.nodes:
        summarize_tree(child)

    has_content       = _has_meaningful_content(node.content)
    has_child_summaries = any(c.summary for c in node.nodes)

    # Nothing meaningful to summarise — skip this node.
    if not has_content and not has_child_summaries:
        return

    # Compose the text to be summarised.
    if has_child_summaries:
        # Build a bullet list of child titles and their summaries.
        children_text = "\n".join(
            f"- {c.title}: {c.summary}"
            for c in node.nodes
            if c.summary
        )
        # If this node also has its own prose, prepend it.
        text = (
            f"{node.content}\n\nChild sections:\n{children_text}"
            if has_content
            else children_text
        )
    else:
        text = node.content

    console.print(f"[dim]  Summarising: {node.title}[/dim]")
    prompt       = SUMMARY_PROMPT.format(title=node.title, content=text[:MAX_SUMMARY_CHARS])
    node.summary = _call_llm(prompt)


# =============================================================================
#  TREE DISPLAY (Rich terminal rendering)
# =============================================================================

def display_tree(node: TreeNode, parent: RichTree | None = None) -> RichTree:
    """
    Render the TreeNode hierarchy as a Rich terminal tree for visual inspection.
    Each node shows its title, node_id, and a truncated summary (if present).
    """
    label = f"[bold]{node.title}[/bold]  [dim]({node.node_id})[/dim]"
    if node.summary:
        short  = node.summary[:120]
        label += f"\n  [italic dim]{short}{'...' if len(node.summary) > 120 else ''}[/italic dim]"

    branch = parent.add(label) if parent else RichTree(label)

    for child in node.nodes:
        display_tree(child, branch)

    return branch


# =============================================================================
#  TREE PERSISTENCE  (save / load JSON)
# =============================================================================

def save_tree(tree: TreeNode, path: Path) -> None:
    """
    Serialise the entire tree (including content and summaries) to a JSON file.

    The JSON file IS the complete index — it can be loaded back without the
    original source document.  ensure_ascii=False preserves non-Latin scripts
    (Hindi, Arabic, Tamil, etc.) without escape sequences.
    """
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(tree.to_dict(include_content=True), fh, indent=2, ensure_ascii=False)
    console.print(f"[green]✓[/green] Tree index saved → {path}")


def load_tree(path: Path) -> TreeNode:
    """Load a previously saved tree index from a JSON file."""
    with open(path, encoding="utf-8") as fh:
        return _dict_to_node(json.load(fh))


def _dict_to_node(d: dict) -> TreeNode:
    """
    Recursively reconstruct a TreeNode from a plain dictionary.

    Bug fix (from original code): the field was named `res` in the original
    _dict_to_node call, but TreeNode has no `res` field — the correct field
    name is `nodes`.  Fixed here.
    """
    return TreeNode(
        title   = d["title"],
        node_id = d["node_id"],
        content = d.get("content", ""),
        summary = d.get("summary", ""),
        nodes   = [_dict_to_node(n) for n in d.get("nodes", [])],   # BUG FIX: was `res=`
    )


# =============================================================================
#  PHASE 3 — TREE SEARCH
# =============================================================================

def create_node_map(node: TreeNode) -> dict[str, TreeNode]:
    """
    Flatten the entire tree into a {node_id: TreeNode} dictionary.

    This converts node lookups from O(n) tree traversal to O(1) dictionary
    access.  The node map is built once per query and used to retrieve raw
    content from the node IDs returned by tree_search.
    """
    result = {node.node_id: node}
    for child in node.nodes:
        result.update(create_node_map(child))
    return result


def tree_search(tree: TreeNode, query: str) -> tuple[list[str], str]:
    """
    Ask the local LLM to identify which tree nodes are relevant to the query.

    The LLM receives the compact tree index (titles + summaries, NO raw content)
    and reasons about relevance.  It returns a JSON object containing:
      - "thinking"  : chain-of-thought reasoning (for auditability)
      - "node_list" : list of node_id strings to retrieve

    Why LLM reasoning instead of vector similarity?
    ------------------------------------------------
    A local embedding model may struggle with paraphrase and domain vocabulary.
    The LLM, even a small 4B model, can understand that "patient discharge after
    surgery" relates to a section titled "Post-Operative Release Procedures".
    Cosine similarity on small embedding models would frequently miss this.

    Bug fix (from original code): `TREEE_SEARCH_PROMPT` (triple-E) → `TREE_SEARCH_PROMPT`.
    """
    # Serialise the tree without raw content — just titles and summaries.
    # This keeps the prompt small (typically 2–20 KB) and within the
    # model's context window.
    tree_index = json.dumps(tree.to_dict(include_content=False), indent=2)

    prompt = TREE_SEARCH_PROMPT.format(query=query, tree_index=tree_index)   # BUG FIX: was TREEE_

    raw_response = _call_llm(prompt, expect_json=True)
    result       = _parse_tree_search_json(raw_response)

    return result.node_list, result.thinking


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
    1. Flatten tree → O(1) node map.
    2. Call tree_search: the LLM selects relevant node IDs by reasoning
       over the compact index (no raw content seen yet).
    3. Retrieve the raw content of each selected node.
    4. Concatenate into a context string (truncated to MAX_CONTEXT_CHARS).
    5. Send context + query to the LLM for final answer generation.

    Parameters
    ----------
    tree  : The document's TreeNode hierarchy (with summaries populated).
    query : The user's natural-language question.

    Returns
    -------
    answer   : The LLM's grounded answer.
    node_ids : The node IDs that were retrieved (for transparency / citation).
    thinking : The LLM's reasoning trace from tree search.
    """
    node_map = create_node_map(tree)

    # ── Phase 3: tree search ──────────────────────────────────────────────────
    node_ids, thinking = tree_search(tree, query)

    if not node_ids:
        return (
            "I could not find this information in the available documents.",
            [],
            thinking,
        )

    # ── Retrieve raw content from selected nodes ──────────────────────────────
    # `if nid in node_map` guards against hallucinated node IDs from the LLM.
    context_parts = [
        node_map[nid].content
        for nid in node_ids
        if nid in node_map
    ]

    if not context_parts:
        return (
            "I could not find this information in the available documents.",
            node_ids,
            thinking,
        )

    # Join all retrieved sections; truncate to avoid context-window overflow.
    context = "\n\n---\n\n".join(context_parts)[:MAX_CONTEXT_CHARS]

    # ── Phase 4: answer generation ────────────────────────────────────────────
    prompt = ANSWER_PROMPT.format(query=query, context=context)
    answer = _call_llm(prompt)

    return answer, node_ids, thinking


# =============================================================================
#  HIGH-LEVEL PUBLIC API
# =============================================================================

def ingest_document(source_path: Path, doc_id: Optional[str] = None) -> tuple[str, Path]:
    """
    Convert a document to a tree index and save it to disk.

    This is the offline equivalent of the vector RAG ingestion pipeline.
    No embedding model, no Chroma, no internet connection required.

    Steps
    -----
    1. Convert the source file to Markdown (PDF → pymupdf4llm; .md → read).
    2. Build the hierarchical TreeNode tree.
    3. Summarise every node bottom-up via the local LLM.
    4. Save the complete tree (content + summaries) as a JSON index.

    Parameters
    ----------
    source_path : Path to the PDF, Markdown, or text file to ingest.
    doc_id      : Optional stable identifier.  If None, a UUID is generated.

    Returns
    -------
    doc_id      : The stable identifier for this document.
    index_path  : Path to the saved JSON tree index.
    """
    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")

    doc_id     = doc_id or uuid.uuid4().hex
    index_path = TREE_DIR / f"{doc_id}.json"

    console.rule(f"[bold blue]Ingesting: {source_path.name}[/bold blue]")

    # ── Step 1: Document → Markdown ───────────────────────────────────────────
    console.print("[cyan]Step 1/3  Loading document → Markdown[/cyan]")
    markdown = load_document_as_markdown(source_path)
    console.print(f"  {len(markdown):,} characters loaded")

    # ── Step 2: Markdown → Tree ───────────────────────────────────────────────
    console.print("[cyan]Step 2/3  Building section tree[/cyan]")
    tree = build_tree(markdown)
    console.print(f"  {tree.node_count()} nodes built")
    console.print(display_tree(tree))

    # ── Step 3: Summarise ─────────────────────────────────────────────────────
    console.print("[cyan]Step 3/3  Summarising nodes (LLM, bottom-up)[/cyan]")
    summarize_tree(tree)

    # ── Save index ────────────────────────────────────────────────────────────
    save_tree(tree, index_path)
    console.print(f"\n[bold green]✓ Ingestion complete.[/bold green]  doc_id = {doc_id}\n")

    return doc_id, index_path


def query_document(
    doc_id_or_path: str | Path,
    query: str,
    *,
    verbose: bool = True,
) -> dict:
    """
    Query a previously ingested document tree.

    Parameters
    ----------
    doc_id_or_path : Either a doc_id string (looks up tree_indexes/<id>.json)
                     or a direct path to a JSON tree index file.
    query          : Natural-language question.
    verbose        : If True, print the reasoning panel and retrieved nodes
                     to the terminal using Rich.

    Returns
    -------
    A dict with keys:
      answer   : str — the grounded answer from the LLM.
      node_ids : list[str] — node IDs retrieved during tree search.
      thinking : str — the LLM's reasoning trace.
      sources  : list[dict] — human-readable source citations.
    """
    # Resolve the index path.
    path = Path(doc_id_or_path)
    if not path.suffix:                               # it's a bare doc_id
        path = TREE_DIR / f"{doc_id_or_path}.json"
    if not path.exists():
        raise FileNotFoundError(f"Tree index not found: {path}")

    console.print(f"\n[bold]Loading index:[/bold] {path.name}")
    tree = load_tree(path)
    console.print(f"  {tree.node_count()} nodes\n")

    answer, node_ids, thinking = retrieve_and_answer(tree, query)

    if verbose:
        console.print(Panel(thinking, title="[yellow]Reasoning[/yellow]", border_style="yellow"))

        node_map = create_node_map(tree)
        console.print("[bold]Retrieved nodes:[/bold]")
        for nid in node_ids:
            if nid in node_map:
                console.print(f"  [cyan]{nid}[/cyan]  {node_map[nid].title}")

        console.print(Panel(answer, title="[green]Answer[/green]", border_style="green"))

    # Build citation list for programmatic use.
    node_map = create_node_map(tree)
    sources  = [
        {"node_id": nid, "title": node_map[nid].title}
        for nid in node_ids
        if nid in node_map
    ]

    return {
        "answer":   answer,
        "node_ids": node_ids,
        "thinking": thinking,
        "sources":  sources,
    }


def query_multiple_documents(
    doc_ids: list[str],
    query: str,
    *,
    top_k_nodes_per_doc: int = 3,
    verbose: bool = True,
) -> dict:
    """
    Query across multiple ingested documents and merge the results.

    For each document, tree_search selects relevant nodes.  All selected
    nodes (across all documents) are ranked by the order in which the LLM
    listed them and the top-k are used for answer generation.

    This is the multi-document retrieval path for institutional deployments
    where a query might span several policy manuals, reports, or records.

    Parameters
    ----------
    doc_ids             : List of doc_id strings to search.
    query               : Natural-language question.
    top_k_nodes_per_doc : Maximum nodes to retrieve per document.
    verbose             : Print progress to terminal.

    Returns
    -------
    Same structure as query_document.
    """
    all_context_parts: list[str] = []
    all_sources: list[dict]      = []
    all_thinking: list[str]      = []

    for doc_id in doc_ids:
        index_path = TREE_DIR / f"{doc_id}.json"
        if not index_path.exists():
            logger.warning("Index not found for doc_id=%s — skipping.", doc_id)
            continue

        console.print(f"[dim]Searching: {doc_id}[/dim]")
        tree     = load_tree(index_path)
        node_map = create_node_map(tree)

        node_ids, thinking = tree_search(tree, query)
        all_thinking.append(f"[{doc_id}] {thinking}")

        for nid in node_ids[:top_k_nodes_per_doc]:
            if nid in node_map:
                all_context_parts.append(node_map[nid].content)
                all_sources.append({"doc_id": doc_id, "node_id": nid, "title": node_map[nid].title})

    if not all_context_parts:
        return {
            "answer":   "I could not find this information in the available documents.",
            "node_ids": [],
            "thinking": "\n\n".join(all_thinking),
            "sources":  [],
        }

    context = "\n\n---\n\n".join(all_context_parts)[:MAX_CONTEXT_CHARS]
    prompt  = ANSWER_PROMPT.format(query=query, context=context)
    answer  = _call_llm(prompt)

    if verbose:
        console.print(Panel(answer, title="[green]Answer[/green]", border_style="green"))

    return {
        "answer":   answer,
        "node_ids": [s["node_id"] for s in all_sources],
        "thinking": "\n\n".join(all_thinking),
        "sources":  all_sources,
    }


# =============================================================================
#  COMMAND-LINE INTERFACE
# =============================================================================

def _build_cli() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="vectorless_rag",
        description="Fully offline Vectorless RAG — no vector DB, no internet.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # ── ingest ────────────────────────────────────────────────────────────────
    p_ingest = sub.add_parser("ingest", help="Ingest a document and build its tree index.")
    p_ingest.add_argument("file", type=Path, help="Path to the PDF, .md, or .txt file.")
    p_ingest.add_argument(
        "--doc-id", default=None,
        help="Optional stable identifier (default: auto-generated UUID).",
    )
    p_ingest.add_argument(
        "--model", default=OLLAMA_MODEL,
        help=f"Ollama model to use for summarisation (default: {OLLAMA_MODEL}).",
    )

    # ── query ─────────────────────────────────────────────────────────────────
    p_query = sub.add_parser("query", help="Query an ingested document.")
    p_query.add_argument("doc_id", help="doc_id returned by `ingest`, or path to the JSON index.")
    p_query.add_argument("query", help="Natural-language question.")
    p_query.add_argument(
        "--model", default=OLLAMA_MODEL,
        help=f"Ollama model to use (default: {OLLAMA_MODEL}).",
    )

    # ── query-all ─────────────────────────────────────────────────────────────
    p_qall = sub.add_parser("query-all", help="Query ALL ingested documents at once.")
    p_qall.add_argument("query", help="Natural-language question.")
    p_qall.add_argument(
        "--model", default=OLLAMA_MODEL,
        help=f"Ollama model to use (default: {OLLAMA_MODEL}).",
    )

    # ── list ──────────────────────────────────────────────────────────────────
    sub.add_parser("list", help="List all ingested documents.")

    return parser


def _cmd_ingest(args: argparse.Namespace) -> None:
    global OLLAMA_MODEL
    OLLAMA_MODEL = args.model
    doc_id, index_path = ingest_document(Path(args.file), doc_id=args.doc_id)
    console.print(f"\n[bold]doc_id :[/bold] {doc_id}")
    console.print(f"[bold]index  :[/bold] {index_path}")


def _cmd_query(args: argparse.Namespace) -> None:
    global OLLAMA_MODEL
    OLLAMA_MODEL = args.model
    query_document(args.doc_id, args.query, verbose=True)


def _cmd_query_all(args: argparse.Namespace) -> None:
    global OLLAMA_MODEL
    OLLAMA_MODEL = args.model
    doc_ids = [p.stem for p in TREE_DIR.glob("*.json")]
    if not doc_ids:
        console.print("[red]No documents ingested yet.  Run `ingest` first.[/red]")
        sys.exit(1)
    console.print(f"Searching {len(doc_ids)} document(s)…\n")
    query_multiple_documents(doc_ids, args.query, verbose=True)


def _cmd_list(_args: argparse.Namespace) -> None:
    indexes = sorted(TREE_DIR.glob("*.json"))
    if not indexes:
        console.print("[yellow]No documents ingested yet.[/yellow]")
        return
    console.print(f"\n[bold]{len(indexes)} ingested document(s):[/bold]\n")
    for idx in indexes:
        try:
            tree = load_tree(idx)
            console.print(
                f"  [cyan]{idx.stem}[/cyan]  "
                f"({tree.node_count()} nodes)  "
                f"[dim]{idx.name}[/dim]"
            )
        except Exception:
            console.print(f"  [red]{idx.stem}[/red]  (could not load)")


# =============================================================================
#  ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    parser = _build_cli()
    args   = parser.parse_args()

    command_map = {
        "ingest":    _cmd_ingest,
        "query":     _cmd_query,
        "query-all": _cmd_query_all,
        "list":      _cmd_list,
    }
    command_map[args.command](args)