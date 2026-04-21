import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from langchain.chat.models import init_chat_model
from langchain_text_splitters import MarkdownHeaderTextSplitter
from pydantic import BaseModel, Field
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax
from rich.tree import Tree as RichTree

DATA_DIR = Path(__file__).parent / "data"
MAX_NODES_DISPLAY = 5
console = Console()

model = init_chat_model(
    "gemma:4b", model_provider = "ollama", reasoning=False, n_ctx=16384, seed=42
)

@dataclass
class TreeNode:
    title: str
    node_id: str
    content: str
    summary: str = ""
    nodes: list["TreeNode"] = field(default_factory=list)

    def to_dict(self, include_content: bool = True) -> dict:
        result = {
            "title": self.title,
            "node_id": self.node_id,
            "summary": self.summary
        }
        if include_content:
            result["content"] = self.content
        if self.nodes:
            result["nodes"] = [n.to_dict(include_content) for n in self.nodes]
        return result
    
    def node_count(self) -> int:
        return 1 + sum(c.node_count() for c in self.nodes)
    

class TreeSearchResult(BaseModel):
    thinking: str = Field(description="Reasoning about which nodes are relevant")
    node_list: list[str] = Field(description="List of relevant node IDs")

search_model = model.with_structured_output(TreeSearchResult)

HEADER_LEVELS = {"title": 1, "section": 2, "subsection": 3}

SUMMARY_PROMPT = """Summarize this document section in 2-3 sentences.
                    State facts directly. No preamble like "Here's a summary".

                    Section: {title}

                    {content}
                """


TREE_SEARCH_PROMPT = """You are given a question and a tree structure of a document.
                        Each node contains a node id, title, and summary.
                        Reason about which nodes are most likely to contain the answer, then list their IDs.

                        Question: {query}

                        Document tree structure: {tree_index}
                    """


ANSWER_PROMPT = """Answer the question based on the context below.
                   If the answer is not in the context, say "I don't know".

                   Question: {query}

                   Context: {context}

                   Answer:
                """


def build_tree(markdown: str) -> TreeNode:
    """Build a hierarchical tree from markdown, splitting at header boundaries."""
    text = markdown.replace("<!-- page_break -->", "\n")

    splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[("#", "title"), ("##", "section"), ("###", "subsection")],
        strip_headers=False,
    )
    sections = splitter.split_text(text)

    root = TreeNode(title="Document", node_id="0000", content="")
    counter = 1
    stack: list[tuple[int, TreeNode]] = [(0, root)]

    for section in sections:
        # Find this sections's own level (deepest header in metadata)
        own_level = 0
        section_title = "Untitled"
        for key in ["title", "section", "subsection"]:
            if key in section.metadata:
                own_level = HEADER_LEVELS[key]
                section_title = section.metadata[key]

        if own_level == 0:
            root.content += section.page_content
            continue

        node = TreeNode(
            title = section_title,
            node_id = f"{counter:04}",
            content = section.page_content
        )
        counter += 1

        # Pop stack to find the right parent (must be at a lower level)
        while len(stack) > 1 and stack[-1][0] >= own_level:
            stack.pop()

        stack[-1][1].nodes.append(node)
        stack.append((own_level, node))

    return root


def _has_meaningful_content(text: str) -> bool:
    """Check if text has content beyond just a markdown header."""
    stripped = re.sub(r"^#+\s+.*$", "", text, flags = re.MULTLINE).strip()
    return len(stripped) > 20

def summarize_tree(node: TreeNode) -> None:
    """Generate LLM summaries bottom-up: leaf nodes first, then parents."""
    for child in node.nodes:
        summarize_tree(child)

    has_content = _has_meaningful_content(node.content)
    has_child_summaries = any(c.summary for c in node.nodes)

    if not has_content and not has_child_summaries:
        return 
    
    # Parent nodes summarize their children's summaries + own content
    # Leaf nodes summarize their content directly
    if has_child_summaries:
        childern_text = "\n".join(
            f"- {c.title}: {c.summary}" for c in node.nodes if c.summary
        )
        text = (
            f"{node.content}\n\nChild sections: \n{childern_text}"
            if has_content
            else childern_text
        )
    else:
        text = node.content

    console.print(f"[dim]Summarizing: {node.title}[/dim]")
    prompt = SUMMARY_PROMPT.format(title = node.title, content = text[:5000])
    node.summary = model.invoke(prompt).content.strip()

def display_tree(node: TreeNode, parent: RichTree | None = None) -> RichTree:
    """render the tree using rich for terminal display."""
    label = f"[bold]{node.title}[/bold] [dim]({node.node_id})[/dim]"
    if node.summary:
        short = node.summary[:120] + ("..." if len(node.summary) > 120 else "")
        label += f"\n[italic]{short}[/italic]"

    branch = parent.add(label) if parent else RichTree(label)

    for child in node.nodes:
        display_tree(child, branch)

    return branch


def save_tree(tree: TreeNode, path: Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(tree.to_dict(), f, indent=2, ensure_ascii=False)
    console.print(f"[green]-[green] saved tree to {path}")

def load_tree(path: Path) -> TreeNode:
    with open(path) as f:
        return _dict_to_node(json.load(f))
    
def _dict_to_node(d: dict) -> TreeNode:
    return TreeNode(
        title = d["title"],
        node_id = d["node_id"],
        content = d.get("content", "",),
        summary = d.get("summary", ""),
        res = [_dict_to_node(n) for n in d.get("nodes", [])],
    )

def create_node_map(node: TreeNode) -> dict[str, TreeNode]:
    """Flatten tree into a {node_id: TreeNode} lookup."""
    result = {node.node_id: node}
    for child in node.nodes:
        result.update(create_node_map(child))
    return result

def tree_search(tree: TreeNode, query: str) -> tuple[list[str], str]:
    """Use LLM with structured output to reason over the tree and find relevant nodes."""
    tree_index = json.dumps(tree.to_dict(include_content=False), indent=2)
    prompt = TREEE_SEARCH_PROMPT.format(query=query, tree_index=tree_index)
    result = search_model.invoke(prompt)
    return result.node_list, result.thinking

def retrieve_and_answer(tree: TreeNode, query: str) -> tuple[str, list[str], str]:
    """Full vectorless RAG pipeline: tree search -> retrieve content -> answer."""
    node_map = create_node_map(tree)

    # step 1: Reasoning-based retrieval via tree search
    node_ids, thinking = tree_search(tree, query)

    # Step 2: Extract content from retrieved nodes
    context = "\n\n".join(node_map[nid].content for nid in node_ids if nid in node_map)

    # Step 3: Generate answer from retrieved context
    prompt = ANSWER_PROMPT.format(query=query, context=context[:8000])
    answer = model.invoke(prompt).content.strip()

    return answer, node_ids, thinking

console.print("\n[bold]VECTORLESS RAG[/bold]\n")

tree_path = DATA_DIR / "nvidia-q3-2025-tree.json"

if tree_path.exists():
    console.print("[bold cyan]Loading existing tree index...[/bold cyan]\n")
    tree = load_tree(tree_path)
    console.print(f"Loaded tree with {tree.node_count()} nodes\n")
else:
    markdown_content = (DATA_DIR / "nvidia-q3-2025-press-release.md").read_text()
    console.print(f"Loaded document: {len(markdown_content):,} characters\n")

    console.print("[bold cyan]Step 1: Build tree structure[/bold cyan]\n")
    tree = build_tree(markdown_content)
    console.print(f"Built tree with {tree.node_count()} nodes\n")

    console.print("[bold cyan] Step 2: Generate node summaries[/bold cyan]\n")
    summarize_tree(tree)
    save_tree(tree, tree_path)

console.print(display_tree(tree))
console.print("\n" + "-" * 80 + "\n")

console.print(
    "[bold cyan] Step 3: Reasoning-based retrieval + Answer generation[/bold cyan] \n"
)

quaries = [
    "What was NVIDIA's total revenue and earnings per share in Q3?"
]

node_map = create_node_map(tree)

# sample

for query in quaries:
    console.print(f"[bold] Query: [/bold] {query} \n")

    answer, node_ids, thinking = retrieve_and_answer(tree, query)

    console.print(Panel(thinking, title="Reasoning", border_style="yellow"))

    console.print("[bold]Retrieved Nodes: [/bold]")
    for nid in node_ids:
        if nid in node_map:
            console.print(f" [cyan]{nid}[/bold] {node_map[nid].title}")

    console.print(f"\n[bold]Answer:[/bold] {answer}\n")
    console.print("-" * 80 + "\n")