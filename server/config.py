"""
config.py — Central configuration for the entire Contexta backend.

Every path, model name, and tunable constant lives here.
No other file should hardcode these values.  Import from this module instead.

To change the LLM model, the storage directory, or any limit, edit ONE place.
"""

from __future__ import annotations

from pathlib import Path

# ── Directory layout ───────────────────────────────────────────────────────────
# All paths are anchored to the directory that contains this file.
# This makes the app CWD-independent regardless of how it is launched.

BASE_DIR: Path = Path(__file__).resolve().parent

# Original uploaded files — never deleted, required for citation streaming.
DOCS_DIR: Path = BASE_DIR / "documents"

# One JSON tree-index per ingested document.
TREE_DIR: Path = BASE_DIR / "tree_indexes"

# Ensure both directories exist at import time.
DOCS_DIR.mkdir(parents=True, exist_ok=True)
TREE_DIR.mkdir(parents=True, exist_ok=True)

# ── Ollama LLM ─────────────────────────────────────────────────────────────────
# The model must be pulled locally before first use:
#   ollama pull llama3
# Supported alternatives: mistral, phi3, gemma:4b, deepseek-r1:7b, etc.

OLLAMA_MODEL: str = "gemma4:e2b"

# Ollama generation options applied to every call.
OLLAMA_OPTIONS: dict = {
    "temperature": 0.1,     # near-deterministic; best for factual retrieval
    "seed":        42,      # reproducible outputs across restarts
    "num_ctx":     16384,   # context window in tokens (≈ chars / 4)
}

# ── Upload limits ──────────────────────────────────────────────────────────────

MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024   # 50 MB hard cap

# ── Tree / chunking parameters ─────────────────────────────────────────────────

# Characters sent to the LLM for summarisation per node.
# Increase if sections are very long; decrease on low-RAM machines.
MAX_SUMMARY_CHARS: int = 5_000

# Characters of retrieved section content fed to the answer LLM.
# Must fit comfortably within OLLAMA_OPTIONS["num_ctx"].
MAX_CONTEXT_CHARS: int = 8_000

# ── CORS ───────────────────────────────────────────────────────────────────────
# Add your frontend origin(s) here.
CORS_ORIGINS: list[str] = [
    "http://localhost:3000",   # Next.js dev server
]