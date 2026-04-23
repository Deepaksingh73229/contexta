"""
services/query_cache.py — Query path cache (LRU + TTL).

Stores resolved node_id paths for repeated queries so they skip the full
retrieval pipeline entirely.

Cache entry format
------------------
{
  "node_ids": ["0003", "0007"],
  "doc_ids":  ["abc123"],
  "ts":       1712345678.0
}

Design
------
- Persisted as a single JSON file: CACHE_DIR/query_cache.json
- In-memory dict is the live cache; JSON is the persistence layer.
- LRU eviction when max entries exceeded.
- TTL eviction on read (stale entries are silently skipped).
- Thread-safe via a simple module-level lock.

Public surface
--------------
  get(query_key)                              → CacheHit | None
  put(query_key, node_ids, doc_ids)           → None
  invalidate_doc(doc_id)                      → None  (when a doc is re-ingested)
  stats()                                     → dict
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from config import CACHE_DIR, CACHE_ENABLED, CACHE_MAX_ENTRIES, CACHE_TTL_SECONDS

logger = logging.getLogger(__name__)

_CACHE_FILE: Path = CACHE_DIR / "query_cache.json"
_lock = threading.Lock()


@dataclass
class CacheHit:
    node_ids: list[str]
    doc_ids:  list[str]
    age_s:    float   # seconds since cached


# ── Normalisation ──────────────────────────────────────────────────────────────

def _normalise(query: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    import re
    q = query.lower()
    q = re.sub(r"[^\w\s]", "", q)
    q = re.sub(r"\s+", " ", q).strip()
    return q


# ── In-memory store (loaded from disk at import) ───────────────────────────────

_cache: dict[str, dict] = {}
_access_order: list[str] = []   # LRU tracking; last = most recently used


def _load():
    global _cache, _access_order
    if not _CACHE_FILE.exists():
        return
    try:
        data = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        now  = time.time()
        for key, entry in data.items():
            if now - entry.get("ts", 0) < CACHE_TTL_SECONDS:
                _cache[key]          = entry
                _access_order.append(key)
        logger.info("Query cache loaded: %d valid entries.", len(_cache))
    except Exception as exc:
        logger.warning("Could not load query cache: %s", exc)


def _save():
    try:
        _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _CACHE_FILE.write_text(
            json.dumps(_cache, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("Could not persist query cache: %s", exc)


# Load at import time.
_load()


# ── Public API ─────────────────────────────────────────────────────────────────

def get(raw_query: str, doc_ids: list[str] | None = None) -> CacheHit | None:
    """
    Look up a query in the cache.

    Parameters
    ----------
    raw_query : User's query string (will be normalised).
    doc_ids   : If provided, the cache key also includes the target doc scope.

    Returns
    -------
    CacheHit if found and not expired; None otherwise.
    """
    if not CACHE_ENABLED:
        return None

    key = _make_key(raw_query, doc_ids)
    with _lock:
        entry = _cache.get(key)
        if entry is None:
            return None

        age = time.time() - entry["ts"]
        if age >= CACHE_TTL_SECONDS:
            # Expired — evict.
            del _cache[key]
            if key in _access_order:
                _access_order.remove(key)
            return None

        # Touch LRU.
        if key in _access_order:
            _access_order.remove(key)
        _access_order.append(key)

        logger.info("Cache HIT for query: %r (age %.0fs)", raw_query[:60], age)
        return CacheHit(
            node_ids=entry["node_ids"],
            doc_ids =entry["doc_ids"],
            age_s   =age,
        )


def put(raw_query: str, node_ids: list[str], doc_ids: list[str]) -> None:
    """Store a resolved query path in the cache."""
    if not CACHE_ENABLED:
        return

    key = _make_key(raw_query, doc_ids)
    with _lock:
        _cache[key] = {
            "node_ids": node_ids,
            "doc_ids":  doc_ids,
            "ts":       time.time(),
        }
        if key in _access_order:
            _access_order.remove(key)
        _access_order.append(key)

        # LRU eviction.
        while len(_cache) > CACHE_MAX_ENTRIES:
            oldest = _access_order.pop(0)
            _cache.pop(oldest, None)

        _save()
    logger.debug("Cache SET for query: %r", raw_query[:60])


def invalidate_doc(doc_id: str) -> None:
    """Remove all cache entries that reference a specific document."""
    with _lock:
        keys_to_remove = [
            k for k, v in _cache.items()
            if doc_id in v.get("doc_ids", [])
        ]
        for k in keys_to_remove:
            del _cache[k]
            if k in _access_order:
                _access_order.remove(k)
        if keys_to_remove:
            logger.info("Cache invalidated %d entries for doc_id=%s", len(keys_to_remove), doc_id)
            _save()


def stats() -> dict:
    """Return cache statistics."""
    with _lock:
        return {
            "entries":      len(_cache),
            "max_entries":  CACHE_MAX_ENTRIES,
            "ttl_seconds":  CACHE_TTL_SECONDS,
            "enabled":      CACHE_ENABLED,
        }


def _make_key(query: str, doc_ids: list[str] | None) -> str:
    norm = _normalise(query)
    if doc_ids:
        scope = ",".join(sorted(doc_ids))
        return f"{norm}||{scope}"
    return norm