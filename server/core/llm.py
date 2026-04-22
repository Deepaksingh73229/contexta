"""
core/llm.py — Offline Ollama LLM client (single access point).

All LLM calls in the codebase go through call_llm().
Switching models requires changing ONE line in config.py.
"""

from __future__ import annotations

import json
import logging
import re

import ollama

from config import OLLAMA_MODEL, OLLAMA_OPTIONS

logger = logging.getLogger(__name__)


def call_llm(prompt: str, *, expect_json: bool = False) -> str:
    request: dict = {
        "model":    OLLAMA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "options":  OLLAMA_OPTIONS,
    }
    if expect_json:
        request["format"] = "json"

    try:
        response = ollama.chat(**request)
        return response["message"]["content"].strip()
    except Exception as exc:
        logger.error("Ollama call failed: %s", exc)
        raise RuntimeError(
            f"Could not reach Ollama or model '{OLLAMA_MODEL}' is not available.\n"
            f"  1. Make sure Ollama is running:  ollama serve\n"
            f"  2. Pull the model if missing:    ollama pull {OLLAMA_MODEL}\n"
            f"  Original error: {exc}"
        ) from exc


def parse_json_response(raw: str) -> dict:
    cleaned = re.sub(r"```(?:json)?\s*", "", raw)
    cleaned = cleaned.rstrip("`").strip()
    return json.loads(cleaned)