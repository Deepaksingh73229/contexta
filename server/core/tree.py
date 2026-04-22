"""
core/tree.py — Document tree data structures and persistence.

Enhanced for enterprise:
  - TreeNode now carries an optional `embedding` field (list[float]).
  - save_tree / load_tree serialise embeddings transparently.
  - create_node_map unchanged (still O(1) lookup after one traversal).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class TreeNode:
    """
    One node in a document's hierarchical section tree.

    Fields
    ------
    title      : Section heading text.
    node_id    : Zero-padded 4-digit string ("0001").
    content    : Full raw Markdown text of this section.
    summary    : 2-3 sentence LLM-generated description (populated by builder).
    embedding  : Float vector of the summary (populated by builder after summarise).
                 Empty list until the embedding step runs.
    nodes      : Immediate child nodes.
    """

    title:     str
    node_id:   str
    content:   str
    summary:   str               = ""
    embedding: list[float]       = field(default_factory=list)
    nodes:     list["TreeNode"]  = field(default_factory=list)

    def to_dict(self, *, include_content: bool = True, include_embedding: bool = True) -> dict:
        result: dict = {
            "title":   self.title,
            "node_id": self.node_id,
            "summary": self.summary,
        }
        if include_content:
            result["content"] = self.content
        if include_embedding and self.embedding:
            result["embedding"] = self.embedding
        if self.nodes:
            result["nodes"] = [
                child.to_dict(include_content=include_content, include_embedding=include_embedding)
                for child in self.nodes
            ]
        return result

    def node_count(self) -> int:
        return 1 + sum(child.node_count() for child in self.nodes)

    def all_nodes(self) -> list["TreeNode"]:
        """Flatten subtree into a list (self first, then children recursively)."""
        result = [self]
        for child in self.nodes:
            result.extend(child.all_nodes())
        return result

    def __repr__(self) -> str:
        return (
            f"TreeNode(id={self.node_id!r}, title={self.title!r}, "
            f"children={len(self.nodes)}, summarised={bool(self.summary)}, "
            f"embedded={bool(self.embedding)})"
        )


# ── Persistence ────────────────────────────────────────────────────────────────

def save_tree(tree: TreeNode, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(
            tree.to_dict(include_content=True, include_embedding=True),
            fh, indent=2, ensure_ascii=False,
        )


def load_tree(path: Path) -> TreeNode:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return _dict_to_node(data)


def _dict_to_node(d: dict) -> TreeNode:
    return TreeNode(
        title     = d["title"],
        node_id   = d["node_id"],
        content   = d.get("content", ""),
        summary   = d.get("summary", ""),
        embedding = d.get("embedding", []),
        nodes     = [_dict_to_node(child) for child in d.get("nodes", [])],
    )


# ── Utilities ──────────────────────────────────────────────────────────────────

def create_node_map(root: TreeNode) -> dict[str, TreeNode]:
    """Flatten an entire tree into a {node_id: TreeNode} lookup dict."""
    result: dict[str, TreeNode] = {root.node_id: root}
    for child in root.nodes:
        result.update(create_node_map(child))
    return result