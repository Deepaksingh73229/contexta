"""
config.py — Central configuration for the Contexta enterprise backend.

All paths, model names, tunable constants, and feature flags are now dynamically 
loaded from the .env file to ensure environment portability and security.
"""

from __future__ import annotations
import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# ── Type Casting Helpers ──────────────────────────────────────────────────────
def get_bool(key: str, default: bool) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return str(val).lower() in ("true", "1", "t", "yes", "y")

def get_list(key: str, default: list[str]) -> list[str]:
    val = os.getenv(key)
    if not val:
        return default
    return [item.strip() for item in val.split(",")]

# ── Directory Layout ──────────────────────────────────────────────────────────
BASE_DIR: Path = Path(__file__).resolve().parent

DOCS_DIR:  Path = BASE_DIR / os.getenv("DIR_DOCS", "documents")
TREE_DIR:  Path = BASE_DIR / os.getenv("DIR_TREE", "tree_indexes")
CACHE_DIR: Path = BASE_DIR / os.getenv("DIR_CACHE", "query_cache")
AUTH_DIR:  Path = BASE_DIR / os.getenv("DIR_AUTH", "auth_data")

# Auto-create necessary directories
for directory in (DOCS_DIR, TREE_DIR, CACHE_DIR, AUTH_DIR):
    directory.mkdir(parents=True, exist_ok=True)

# ── Authentication ────────────────────────────────────────────────────────────
AUTH_ALGORITHM: str = os.getenv("AUTH_ALGORITHM", "HS256")
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("AUTH_ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
AUTH_REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("AUTH_REFRESH_TOKEN_EXPIRE_DAYS", "7"))

_SECRET_KEY_FILE: Path = AUTH_DIR / "secret.key"

def _load_or_create_secret() -> str:
    # 1. Prioritize explicitly provided environment variable
    env_secret = os.getenv("AUTH_SECRET_KEY")
    if env_secret:
        return env_secret

    # 2. Fallback to reading from local file
    if _SECRET_KEY_FILE.exists():
        return _SECRET_KEY_FILE.read_text().strip()

    # 3. Ultimate Fallback: Auto-generate, save, and secure the file
    key = secrets.token_hex(32)  # 256-bit secret
    _SECRET_KEY_FILE.write_text(key)
    _SECRET_KEY_FILE.chmod(0o600)  # Owner read/write only
    return key

AUTH_SECRET_KEY: str = _load_or_create_secret()

# LLM PROVIDER
LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama").lower()
GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# ── Ollama LLM ────────────────────────────────────────────────────────────────
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "gemma3:4b")

OLLAMA_OPTIONS: dict = {
    "temperature": float(os.getenv("OLLAMA_OPTIONS_TEMPERATURE", "0.1")),
    "seed":        int(os.getenv("OLLAMA_OPTIONS_SEED", "42")),
    "num_ctx":     int(os.getenv("OLLAMA_OPTIONS_NUM_CTX", "16384")),
}

# ── Embedding Model ───────────────────────────────────────────────────────────
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
EMBEDDING_DIM:   int = int(os.getenv("EMBEDDING_DIM", "384"))

# ── Upload Limits ─────────────────────────────────────────────────────────────
MAX_UPLOAD_BYTES: int = int(os.getenv("MAX_UPLOAD_BYTES", "52428800"))

# ── Tree / Chunking Parameters ────────────────────────────────────────────────
MAX_SUMMARY_CHARS: int = int(os.getenv("MAX_SUMMARY_CHARS", "5000"))
MAX_CONTEXT_CHARS: int = int(os.getenv("MAX_CONTEXT_CHARS", "8000"))

# ── Retrieval Parameters ──────────────────────────────────────────────────────
BEAM_TOP_K_L1: int = int(os.getenv("BEAM_TOP_K_L1", "3"))
BEAM_TOP_K_L2: int = int(os.getenv("BEAM_TOP_K_L2", "2"))
BEAM_TOP_K_L3: int = int(os.getenv("BEAM_TOP_K_L3", "2"))

HYBRID_WEIGHT_SEMANTIC: float = float(os.getenv("HYBRID_WEIGHT_SEMANTIC", "0.50"))
HYBRID_WEIGHT_BM25:     float = float(os.getenv("HYBRID_WEIGHT_BM25", "0.30"))
HYBRID_WEIGHT_METADATA: float = float(os.getenv("HYBRID_WEIGHT_METADATA", "0.20"))

RETRIEVAL_STAGE1_TOP_N: int = int(os.getenv("RETRIEVAL_STAGE1_TOP_N", "20"))
RETRIEVAL_STAGE2_TOP_K: int = int(os.getenv("RETRIEVAL_STAGE2_TOP_K", "5"))

# ── Multi-Query Expansion ─────────────────────────────────────────────────────
MULTI_QUERY_COUNT:     int  = int(os.getenv("MULTI_QUERY_COUNT", "3"))
MULTI_QUERY_ENABLED:   bool = get_bool("MULTI_QUERY_ENABLED", True)

# ── Query Path Cache ──────────────────────────────────────────────────────────
CACHE_ENABLED:     bool = get_bool("CACHE_ENABLED", True)
CACHE_MAX_ENTRIES: int  = int(os.getenv("CACHE_MAX_ENTRIES", "1000"))
CACHE_TTL_SECONDS: int  = int(os.getenv("CACHE_TTL_SECONDS", "604800"))

# ── Context Builder ───────────────────────────────────────────────────────────
CONTEXT_DEDUP_THRESHOLD: float = float(os.getenv("CONTEXT_DEDUP_THRESHOLD", "0.92"))
CONTEXT_MERGE_SIBLINGS:  bool  = get_bool("CONTEXT_MERGE_SIBLINGS", True)

# ── Cross-encoder Re-ranking ──────────────────────────────────────────────────
RERANKER_ENABLED: bool = get_bool("RERANKER_ENABLED", True)
RERANKER_MODEL:   str  = os.getenv("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")

# ── Parallel Ingestion ────────────────────────────────────────────────────────
MAX_PARALLEL_INGESTIONS: int = int(os.getenv("MAX_PARALLEL_INGESTIONS", "2"))
SUMMARISE_WORKERS:       int = int(os.getenv("SUMMARISE_WORKERS", "3"))
TASK_HISTORY_LIMIT:      int = int(os.getenv("TASK_HISTORY_LIMIT", "100"))

QUERY_REWRITE_ENABLED = True

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ORIGINS: list[str] = get_list("CORS_ORIGINS", ["http://localhost:3000"])



# ══════════════════════════════════════════════════════════════════════════════
# config.py — append these lines after the existing CORS block
# ══════════════════════════════════════════════════════════════════════════════

# ── LLM Provider toggle ────────────────────────────────────────────────────────
# Defaults to "ollama" so zero changes needed for existing setups.
LLM_PROVIDER:    str = os.getenv("LLM_PROVIDER",    "ollama")   # "ollama" | "gemini"
VISION_PROVIDER: str = os.getenv("VISION_PROVIDER", "ollama")   # "ollama" | "gemini"

# ── Gemini API ─────────────────────────────────────────────────────────────────
GEMINI_API_KEY:      str = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL:        str = os.getenv("GEMINI_MODEL",        "gemini-2.0-flash")
GEMINI_VISION_MODEL: str = os.getenv("GEMINI_VISION_MODEL", "gemini-3-flash-preview")

# ── Image Ingestion ────────────────────────────────────────────────────────────
IMAGE_INGESTION_ENABLED: bool = get_bool("IMAGE_INGESTION_ENABLED", True)
VISION_MODEL:            str  = os.getenv("VISION_MODEL", "llava:7b")
IMAGE_MIN_WIDTH:         int  = int(os.getenv("IMAGE_MIN_WIDTH",  "100"))
IMAGE_MIN_HEIGHT:        int  = int(os.getenv("IMAGE_MIN_HEIGHT", "100"))
IMAGE_MAX_PER_DOC:       int  = int(os.getenv("IMAGE_MAX_PER_DOC", "50"))
IMAGE_DIR:               Path = BASE_DIR / os.getenv("IMAGE_DIR", "image_store")


# ══════════════════════════════════════════════════════════════════════════════
# .env — three ready-to-use scenarios (uncomment the one you want)
# ══════════════════════════════════════════════════════════════════════════════

# ── Scenario A: fully offline (default — no changes needed) ───────────────────
# LLM_PROVIDER=ollama
# VISION_PROVIDER=ollama
# OLLAMA_MODEL=gemma3:4b
# VISION_MODEL=llava:7b

# ── Scenario B: Gemini for text, llava for vision ─────────────────────────────
# LLM_PROVIDER=gemini
# VISION_PROVIDER=ollama
# GEMINI_API_KEY=AIzaSy...
# GEMINI_MODEL=gemini-2.0-flash
# VISION_MODEL=llava:7b

# ── Scenario C: Gemini for everything (no local GPU needed) ───────────────────
# LLM_PROVIDER=gemini
# VISION_PROVIDER=gemini
# GEMINI_API_KEY=AIzaSy...
# GEMINI_MODEL=gemini-2.0-flash
# GEMINI_VISION_MODEL=gemini-2.0-flash