"""
core/llm.py — Universal LLM client (Ollama ↔ Gemini, single toggle).

All LLM calls in the codebase go through call_llm() or call_vision_llm().
Switch providers by setting LLM_PROVIDER in your .env:

    LLM_PROVIDER=ollama   # default — fully offline, no API key needed
    LLM_PROVIDER=gemini   # Google Gemini API

Vision calls (image description) always use VISION_PROVIDER, which can be
set independently — e.g. Ollama for text, Gemini for vision:

    VISION_PROVIDER=ollama   # llava / minicpm-v  (default)
    VISION_PROVIDER=gemini   # gemini-1.5-flash / gemini-2.0-flash

Usage
─────
    from core.llm import call_llm, call_vision_llm
    from core.prompt_registry import get_prompt, prompt_expects_json

    # Text call (intent analysis, summarisation, synthesis, …)
    prompt = get_prompt("intent_analysis", query="What is the leave policy?")
    result = call_llm(prompt, expect_json=prompt_expects_json("intent_analysis"))

    # Vision call (image description)
    prompt = get_prompt("image_description")
    result = call_vision_llm(prompt, image_b64="<base64 string>")

Config keys (config.py / .env)
──────────────────────────────
    LLM_PROVIDER      = "ollama" | "gemini"
    VISION_PROVIDER   = "ollama" | "gemini"

    # Ollama
    OLLAMA_MODEL      = "gemma3:4b"
    OLLAMA_OPTIONS    = { temperature, seed, num_ctx }
    VISION_MODEL      = "llava:7b"

    # Gemini
    GEMINI_API_KEY    = "AIza..."
    GEMINI_MODEL      = "gemini-2.0-flash"
    GEMINI_VISION_MODEL = "gemini-2.0-flash"   # same model supports vision
"""

from __future__ import annotations

import json
import logging
import re

from config import (
    LLM_PROVIDER,
    VISION_PROVIDER,
    OLLAMA_MODEL,
    OLLAMA_OPTIONS,
    VISION_MODEL,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GEMINI_VISION_MODEL,
)

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
#  TEXT LLM  —  call_llm()
# ══════════════════════════════════════════════════════════════════════════════

def call_llm(prompt: str, *, expect_json: bool = False) -> str:
    """
    Main entry point for all text LLM calls.
    Routes to Ollama or Gemini based on LLM_PROVIDER.

    Parameters
    ----------
    prompt      : Fully rendered prompt string (use get_prompt() to build it).
    expect_json : If True, instructs the model to return valid JSON only.

    Returns
    -------
    Raw text response from the model (stripped).
    """
    if LLM_PROVIDER == "gemini":
        return _call_gemini_text(prompt, expect_json=expect_json)
    return _call_ollama_text(prompt, expect_json=expect_json)


def _call_ollama_text(prompt: str, expect_json: bool = False) -> str:
    """Send a text prompt to the local Ollama instance."""
    try:
        import ollama
    except ImportError:
        raise RuntimeError(
            "ollama package is required. Install: pip install ollama --break-system-packages"
        )

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
        logger.error("Ollama text call failed: %s", exc)
        raise RuntimeError(
            f"Could not reach Ollama or model '{OLLAMA_MODEL}' is not available.\n"
            f"  1. Make sure Ollama is running:  ollama serve\n"
            f"  2. Pull the model if missing:    ollama pull {OLLAMA_MODEL}\n"
            f"  Original error: {exc}"
        ) from exc


def _call_gemini_text(prompt: str, expect_json: bool = False) -> str:
    """Send a text prompt to the Google Gemini API."""
    _require_gemini_key()
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise RuntimeError(
            "google-genai package is required for Gemini. "
            "Install: pip install google-genai --break-system-packages"
        )

    try:
        client      = genai.Client(api_key=GEMINI_API_KEY)
        config_args = {}
        if expect_json:
            config_args["response_mime_type"] = "application/json"
            prompt = prompt + "\n\nCRITICAL: You must respond in valid JSON format only."

        config   = types.GenerateContentConfig(**config_args) if config_args else None
        response = client.models.generate_content(
            model    = GEMINI_MODEL,
            contents = prompt,
            config   = config,
        )
        return response.text.strip()
    except Exception as exc:
        logger.error("Gemini text call failed: %s", exc)
        raise RuntimeError(f"Could not reach Gemini API: {exc}") from exc


# ══════════════════════════════════════════════════════════════════════════════
#  VISION LLM  —  call_vision_llm()
# ══════════════════════════════════════════════════════════════════════════════

def call_vision_llm(prompt: str, image_b64: str, *, mime_type: str = "image/png") -> str:
    """
    Entry point for all vision (image + text) LLM calls.
    Routes to Ollama vision model or Gemini based on VISION_PROVIDER.

    Parameters
    ----------
    prompt     : Text prompt rendered from get_prompt("image_description").
    image_b64  : Base64-encoded image bytes (no data URI prefix).
    mime_type  : MIME type of the image — used by Gemini only.
                 Ollama infers the type automatically.

    Returns
    -------
    Raw text description from the vision model (stripped).
    """
    if VISION_PROVIDER == "gemini":
        return _call_gemini_vision(prompt, image_b64, mime_type=mime_type)
    return _call_ollama_vision(prompt, image_b64)


def _call_ollama_vision(prompt: str, image_b64: str) -> str:
    """Send an image + prompt to the local Ollama vision model (e.g. llava:7b)."""
    try:
        import ollama
    except ImportError:
        raise RuntimeError(
            "ollama package is required. Install: pip install ollama --break-system-packages"
        )

    try:
        response = ollama.chat(
            model    = VISION_MODEL,
            messages = [{"role": "user", "content": prompt, "images": [image_b64]}],
            options  = {"temperature": 0.1, "seed": 42},
        )
        return response["message"]["content"].strip()
    except Exception as exc:
        logger.error("Ollama vision call failed (model=%s): %s", VISION_MODEL, exc)
        raise RuntimeError(
            f"Could not reach Ollama vision model '{VISION_MODEL}'.\n"
            f"  Pull the model:  ollama pull {VISION_MODEL}\n"
            f"  Original error: {exc}"
        ) from exc


def _call_gemini_vision(prompt: str, image_b64: str, *, mime_type: str = "image/png") -> str:
    """Send an image + prompt to the Google Gemini vision API."""
    _require_gemini_key()
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise RuntimeError(
            "google-genai package is required for Gemini vision. "
            "Install: pip install google-genai --break-system-packages"
        )

    import base64
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        image_part = types.Part.from_bytes(
            data      = base64.b64decode(image_b64),
            mime_type = mime_type,
        )
        response = client.models.generate_content(
            model    = GEMINI_VISION_MODEL,
            contents = [image_part, prompt],
        )
        return response.text.strip()
    except Exception as exc:
        logger.error("Gemini vision call failed: %s", exc)
        raise RuntimeError(f"Could not reach Gemini vision API: {exc}") from exc


# ══════════════════════════════════════════════════════════════════════════════
#  UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

def parse_json_response(raw: str) -> dict:
    """
    Safely strips markdown fences and parses a JSON response.
    Works for both Ollama and Gemini outputs.
    """
    cleaned = re.sub(r"```(?:json)?\s*", "", raw)
    cleaned = cleaned.rstrip("`").strip()
    return json.loads(cleaned)


def _require_gemini_key() -> None:
    if not GEMINI_API_KEY:
        raise ValueError(
            "GEMINI_API_KEY is not set. Add it to your .env file:\n"
            "  GEMINI_API_KEY=AIza...\n"
            "Or switch back to Ollama:\n"
            "  LLM_PROVIDER=ollama"
        )