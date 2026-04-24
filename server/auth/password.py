"""
auth/password.py — Offline password hashing with bcrypt.

Uses the `passlib` library with bcrypt backend.
100% offline — no network calls, no external services.

Why bcrypt?
-----------
- Adaptive cost factor (work rounds) — slows brute-force as hardware improves.
- Built-in salt — same password hashes differently each time.
- Widely audited, proven security track record.
- Completely offline — ships as a compiled C extension.

Install:
    pip install passlib[bcrypt] --break-system-packages

Public surface
--------------
  hash_password(plain)          → str   (bcrypt hash)
  verify_password(plain, hashed) → bool
  password_meets_policy(plain)   → (bool, str)  (is_ok, reason_if_not)
"""

from __future__ import annotations

import re


try:
    from passlib.context import CryptContext
    _ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    _PASSLIB_AVAILABLE = True
except ImportError:
    _PASSLIB_AVAILABLE = False


def hash_password(plain: str) -> str:
    """
    Hash a plain-text password with bcrypt.

    Returns the full bcrypt hash string (includes algorithm, rounds, salt, hash).
    Store this string in the user record — never store the plain password.
    """
    if not _PASSLIB_AVAILABLE:
        raise RuntimeError(
            "passlib[bcrypt] is required for password hashing.\n"
            "Install: pip install passlib[bcrypt] --break-system-packages"
        )
    return _ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify a plain-text password against a stored bcrypt hash.

    Returns True if they match, False otherwise.
    Timing-safe — always takes the same time regardless of match.
    """
    if not _PASSLIB_AVAILABLE:
        raise RuntimeError("passlib[bcrypt] is required.")
    try:
        return _ctx.verify(plain, hashed)
    except Exception:
        return False


def password_meets_policy(plain: str) -> tuple[bool, str]:
    """
    Check a plain-text password against the security policy.

    Policy:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character

    Returns
    -------
    (True, "")                  — password is acceptable
    (False, "reason string")    — password violates policy
    """
    if len(plain.encode("utf-8")) > 72:
        return False, "Password must be at most 72 bytes long for bcrypt."
    if len(plain) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", plain):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", plain):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"\d", plain):
        return False, "Password must contain at least one digit."
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?]", plain):
        return False, "Password must contain at least one special character."
    return True, ""