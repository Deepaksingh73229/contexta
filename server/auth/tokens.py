"""
auth/tokens.py — Offline JWT token management (HS256).

Generates, signs, and verifies JSON Web Tokens using a local secret key.
100% offline — no external auth service, no OAuth, no JWKS endpoint.

Token design
------------
Two-token model:
  access_token  : Short-lived (default 30 min). Sent with every API request.
  refresh_token : Long-lived (default 7 days). Used only to get a new access token.

The access token payload contains:
  sub    : user_id (str)
  role   : role string (e.g. "admin")
  type   : "access"
  jti    : unique token ID (for revocation if needed)
  iat    : issued-at timestamp
  exp    : expiry timestamp

Security notes
--------------
- Secret key is read from config.AUTH_SECRET_KEY (generated once on first run).
- HS256 is appropriate for single-server deployments (symmetric key).
- Tokens are stateless — no database lookup on every request.
- Refresh tokens can be revoked by tracking jti in a revocation set (see token_store.py).

Install:
    pip install python-jose[cryptography] --break-system-packages

Public surface
--------------
  create_access_token(user_id, role)  → str
  create_refresh_token(user_id, role) → str
  verify_token(token)                 → TokenPayload | None
  create_token_pair(user_id, role)    → TokenPair
"""

from __future__ import annotations

import secrets
import time
import uuid
from dataclasses import dataclass

from config import (
    AUTH_SECRET_KEY,
    AUTH_ACCESS_TOKEN_EXPIRE_MINUTES,
    AUTH_REFRESH_TOKEN_EXPIRE_DAYS,
    AUTH_ALGORITHM,
)

try:
    from jose import JWTError, jwt as jose_jwt
    _JOSE_AVAILABLE = True
except ImportError:
    _JOSE_AVAILABLE = False


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class TokenPayload:
    user_id:  str
    role:     str
    token_type: str    # "access" or "refresh"
    jti:      str      # unique token ID


@dataclass
class TokenPair:
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    expires_in:    int = AUTH_ACCESS_TOKEN_EXPIRE_MINUTES * 60   # seconds


# ── Token creation ─────────────────────────────────────────────────────────────

def _require_jose() -> None:
    if not _JOSE_AVAILABLE:
        raise RuntimeError(
            "python-jose[cryptography] is required for JWT tokens.\n"
            "Install: pip install python-jose[cryptography] --break-system-packages"
        )


def create_access_token(user_id: str, role: str) -> str:
    """Create a short-lived access token."""
    _require_jose()
    now = int(time.time())
    payload = {
        "sub":  user_id,
        "role": role,
        "type": "access",
        "jti":  uuid.uuid4().hex,
        "iat":  now,
        "exp":  now + AUTH_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }
    return jose_jwt.encode(payload, AUTH_SECRET_KEY, algorithm=AUTH_ALGORITHM)


def create_refresh_token(user_id: str, role: str) -> str:
    """Create a long-lived refresh token."""
    _require_jose()
    now = int(time.time())
    payload = {
        "sub":  user_id,
        "role": role,
        "type": "refresh",
        "jti":  uuid.uuid4().hex,
        "iat":  now,
        "exp":  now + AUTH_REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    }
    return jose_jwt.encode(payload, AUTH_SECRET_KEY, algorithm=AUTH_ALGORITHM)


def create_token_pair(user_id: str, role: str) -> TokenPair:
    """Create both access and refresh tokens for a user."""
    return TokenPair(
        access_token  = create_access_token(user_id, role),
        refresh_token = create_refresh_token(user_id, role),
        expires_in    = AUTH_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Token verification ─────────────────────────────────────────────────────────

def verify_token(token: str, expected_type: str = "access") -> TokenPayload | None:
    """
    Verify a JWT token and return its payload.

    Parameters
    ----------
    token         : The raw JWT string from the Authorization header.
    expected_type : "access" or "refresh" — rejects tokens of wrong type.

    Returns
    -------
    TokenPayload if valid, None if expired / invalid / wrong type.
    """
    _require_jose()
    try:
        data = jose_jwt.decode(token, AUTH_SECRET_KEY, algorithms=[AUTH_ALGORITHM])
        if data.get("type") != expected_type:
            return None
        return TokenPayload(
            user_id    = str(data["sub"]),
            role       = str(data.get("role", "viewer")),
            token_type = str(data["type"]),
            jti        = str(data.get("jti", "")),
        )
    except JWTError:
        return None
    except Exception:
        return None