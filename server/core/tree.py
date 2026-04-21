"""
core/tree.py — Document tree data structures and persistence.

This module is the ONLY place in the codebase that defines what a tree node
is and how to serialise / deserialise it.  It has no dependency on FastAPI,
Ollama, or any file-upload logic.  That separation means:

  • Unit tests can import this file without starting a server.
  • The tree format can be changed (e.g. to a database) by editing one file.
  • Ingestion and query routers both share the same stable data contract.

Public surface
--------------
  TreeNode          — dataclass representing one document section.
  save_tree(tree, path)    — serialise a tree to a JSON file.
  load_tree(path)          — deserialise a tree from a JSON file.
  create_node_map(tree)    — flatten the tree to a {node_id: TreeNode} dict.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


# =============================================================================
#  DATA STRUCTURE
# =============================================================================

@dataclass
class TreeNode:
    """
    One node in a document's hierarchical section tree.

    Attributes
    ----------
    title    : Section heading text (e.g. "3.2 Patient Discharge Procedures").
    node_id  : Zero-padded 4-digit string assigned during tree building
               ("0001", "0042").  Stable across serialise / deserialise cycles.
               The LLM references these IDs during tree search.
    content  : Full raw Markdown text of this section, including its own
               header line.  Kept intact so the answer LLM receives self-
               contained context without needing the surrounding tree.
    summary  : 2-3 sentence LLM-generated description of what this section
               contains.  Empty string until summarize_tree() is called.
               The search LLM reads only summaries, never raw content.
    nodes    : Immediate child nodes (sub-sections).
               field(default_factory=list) gives each instance its own list
               instead of sharing a single mutable default across instances.
    """

    title:   str
    node_id: str
    content: str
    summary: str                  = ""
    nodes:   list["TreeNode"]     = field(default_factory=list)

    # ── Serialisation ──────────────────────────────────────────────────────────

    def to_dict(self, *, include_content: bool = True) -> dict:
        """
        Recursively convert this node (and all descendants) to a plain dict.

        Parameters
        ----------
        include_content : When False, the raw section text is omitted.
                          Use include_content=False to build the compact
                          "tree index" sent to the LLM during tree search —
                          it contains only title, node_id, and summary, keeping
                          the prompt small while still enabling relevance reasoning.

        Returns
        -------
        A JSON-serialisable dict.  Nested nodes appear under the "nodes" key.
        """
        result: dict = {
            "title":   self.title,
            "node_id": self.node_id,
            "summary": self.summary,
        }
        if include_content:
            result["content"] = self.content
        if self.nodes:
            result["nodes"] = [
                child.to_dict(include_content=include_content)
                for child in self.nodes
            ]
        return result

    # ── Utilities ──────────────────────────────────────────────────────────────

    def node_count(self) -> int:
        """Total number of nodes in the subtree rooted at this node (self included)."""
        return 1 + sum(child.node_count() for child in self.nodes)

    def __repr__(self) -> str:
        return (
            f"TreeNode(id={self.node_id!r}, title={self.title!r}, "
            f"children={len(self.nodes)}, summarised={bool(self.summary)})"
        )


# =============================================================================
#  PERSISTENCE
# =============================================================================

def save_tree(tree: TreeNode, path: Path) -> None:
    """
    Serialise a complete tree (with content AND summaries) to a JSON file.

    The saved file IS the complete, self-contained index.  It can be loaded
    and queried without the original source document being present.

    Parameters
    ----------
    tree : Root TreeNode (typically the "Document" sentinel node).
    path : Destination file path.  Parent directories must exist.

    Design notes
    ------------
    - ensure_ascii=False keeps non-Latin scripts (Hindi, Arabic, Tamil, etc.)
      as-is instead of escaping them to \\uXXXX sequences.
    - indent=2 makes the JSON human-readable and diff-friendly in version control.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(tree.to_dict(include_content=True), fh, indent=2, ensure_ascii=False)


def load_tree(path: Path) -> TreeNode:
    """
    Deserialise a tree from a previously saved JSON file.

    Parameters
    ----------
    path : Path to the JSON index file.

    Raises
    ------
    FileNotFoundError : If path does not exist.
    json.JSONDecodeError : If the file is not valid JSON.
    """
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return _dict_to_node(data)


def _dict_to_node(d: dict) -> TreeNode:
    """
    Recursively reconstruct a TreeNode from a plain dictionary.

    Uses .get() with safe defaults for optional fields so that a tree saved
    without content (e.g. a compact summary-only export) can still be loaded.

    Bug fixed from original vectorless_rag.py:
      The original code used `res=[...]` which is not a field on TreeNode.
      Corrected to `nodes=[...]`.
    """
    return TreeNode(
        title   = d["title"],
        node_id = d["node_id"],
        content = d.get("content", ""),
        summary = d.get("summary", ""),
        nodes   = [_dict_to_node(child) for child in d.get("nodes", [])],
    )


# =============================================================================
#  UTILITIES
# =============================================================================

def create_node_map(root: TreeNode) -> dict[str, TreeNode]:
    """
    Flatten an entire tree into a {node_id: TreeNode} lookup dictionary.

    Why this exists
    ---------------
    After tree_search returns a list of node_id strings, we need to fetch
    each node's raw content in O(1) time.  Walking the tree for each ID
    would be O(n) per lookup.  Building this map once per query request
    converts all subsequent lookups to O(1).

    Parameters
    ----------
    root : Root TreeNode of the document.

    Returns
    -------
    A flat dict mapping every node_id in the tree to its TreeNode object.
    """
    result: dict[str, TreeNode] = {root.node_id: root}
    for child in root.nodes:
        result.update(create_node_map(child))
    return result