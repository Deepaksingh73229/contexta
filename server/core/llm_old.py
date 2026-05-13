"""
core/llm.py — Universal LLM client (single access point).

Routes requests to either a local Ollama instance or the cloud Gemini API
based on the LLM_PROVIDER setting in the environment variables.
"""

from __future__ import annotations

import json
import logging
import re

import ollama
from google import genai
from google.genai import types

from config import (
    LLM_PROVIDER,
    OLLAMA_MODEL, 
    OLLAMA_OPTIONS,
    GEMINI_API_KEY,
    GEMINI_MODEL
)

logger = logging.getLogger(__name__)


def _call_gemini(prompt: str, expect_json: bool = False) -> str:
    """Handles requests to Google's Gemini API using the modern google-genai SDK."""
    if not GEMINI_API_KEY:
        raise ValueError(
            "GEMINI_API_KEY is missing. Please set it in your .env file "
            "to use the 'gemini' provider."
        )
    
    try:
        # The new SDK initializes the client directly
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        # We now use types.GenerateContentConfig for settings like JSON mode
        config_args = {}
        if expect_json:
            config_args["response_mime_type"] = "application/json"
            prompt += "\n\nCRITICAL: You must respond in valid JSON format only."
            
        config = types.GenerateContentConfig(**config_args) if config_args else None
        
        # The method is now under client.models
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=config
        )
        return response.text.strip()
        
    except Exception as exc:
        logger.error("Gemini API call failed: %s", exc)
        raise RuntimeError(f"Could not reach Gemini API: {exc}") from exc
    

def call_llm(prompt: str, *, expect_json: bool = False) -> str:
    """
    Main entry point for all LLM calls. 
    Routes to the configured provider automatically.
    """
    if LLM_PROVIDER == "gemini":
        return _call_gemini(prompt, expect_json=expect_json)
    
    # Default fallback is always the local, secure Ollama
    return _call_ollama(prompt, expect_json=expect_json)


def _call_ollama(prompt: str, expect_json: bool = False) -> str:
    """Handles requests to the local Ollama service."""
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
    """
    Safely strips markdown formatting and parses JSON.
    Works flawlessly for both Ollama and Gemini outputs.
    """
    cleaned = re.sub(r"```(?:json)?\s*", "", raw)
    cleaned = cleaned.rstrip("`").strip()
    return json.loads(cleaned)