"""
core/llm.py — Offline Ollama LLM client.

This module is the SINGLE place where the rest of the codebase talks to
the local Ollama daemon.  No other file should import `ollama` directly.

Centralising LLM calls here means:
  • Switching models (e.g. llama3 → mistral) requires changing ONE line in config.py.
  • Retry logic, logging, and error messages live in one place.
  • Unit tests can mock _call_llm without patching scattered import sites.

Public surface
--------------
  call_llm(prompt, expect_json) → str
      Send a prompt to the configured local Ollama model and return the
      text response.  100% offline — no API keys, no internet.

  parse_json_response(raw) → dict
      Robustly parse a JSON string that may be wrapped in markdown fences.
"""

from __future__ import annotations

import json
import logging
import re

import ollama

from config import OLLAMA_MODEL, OLLAMA_OPTIONS

logger = logging.getLogger(__name__)


# =============================================================================
#  LLM CALL
# =============================================================================

def call_llm(prompt: str, *, expect_json: bool = False) -> str:
    """
    Send a prompt to the local Ollama model and return its text response.

    Parameters
    ----------
    prompt      : Complete prompt string to send as the user message.
    expect_json : When True, Ollama's `format="json"` mode is enabled.
                  This instructs the model to return only valid JSON — no
                  prose, no markdown fences.  Supported by llama3, mistral,
                  phi3, gemma as of Ollama ≥ 0.1.28.

    Returns
    -------
    The stripped text content of the model's response message.

    Raises
    ------
    RuntimeError : If the Ollama daemon is unreachable or the model is not
                   pulled.  The error message contains the exact commands the
                   user needs to run to fix the issue.

    Why the `ollama` package instead of LangChain?
    -----------------------------------------------
    The `ollama` Python package communicates directly with the Ollama HTTP
    daemon at localhost:11434.  LangChain's ChatOllama does the same but
    wraps it in additional abstractions (chains, runnables) that add latency
    and require extra packages.  For a fully offline system we want the
    thinnest possible client.
    """
    request: dict = {
        "model":    OLLAMA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "options":  OLLAMA_OPTIONS,
    }

    if expect_json:
        # Forces the model to emit valid JSON — no explanatory prose around it.
        # Fall back gracefully in parse_json_response if the model ignores this.
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


# =============================================================================
#  JSON PARSING HELPER
# =============================================================================

def parse_json_response(raw: str) -> dict:
    """
    Robustly parse a JSON string that may be wrapped in markdown code fences.

    Small local LLMs sometimes wrap their JSON output in triple-backtick
    fences (```json ... ```) despite instructions not to.  This function
    strips those fences before parsing.

    Parameters
    ----------
    raw : The raw string returned by call_llm(expect_json=True).

    Returns
    -------
    A parsed Python dict.

    Raises
    ------
    json.JSONDecodeError : If the cleaned string is still not valid JSON.
                           Callers should catch this and provide a safe fallback.
    """
    # Remove opening fence:  ```json\n  or  ```\n
    cleaned = re.sub(r"```(?:json)?\s*", "", raw)
    # Remove closing fence:  ```
    cleaned = cleaned.rstrip("`").strip()

    return json.loads(cleaned)