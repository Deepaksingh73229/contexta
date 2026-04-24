"""
auth/dependencies.py — FastAPI dependency injection for authentication and authorisation.

Usage in a router
-----------------
    from auth.dependencies import get_current_user, require_permission
    from auth.permissions import Permission

    # Any authenticated user:
    @router.get("/me")
    def me(user = Depends(get_current_user)):
        return user.to_public()

    # Specific permission required:
    @router.post("/api/ingest")
    async def ingest(
        file: UploadFile = File(...),
        user = Depends(require_permission(Permission.INGEST_CREATE)),
    ):
        ...

    # Admin only:
    @router.get("/api/admin/users")
    def list_users(user = Depends(require_permission(Permission.ADMIN_USERS))):
        ...

Public surface
--------------
  get_current_user(token)        → UserRecord   (raises 401 if invalid)
  require_permission(permission) → Callable     (raises 403 if lacking permission)
  get_current_user_optional(token) → UserRecord | None  (for public+auth endpoints)
"""

from __future__ import annotations

import logging
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth.permissions import Permission, has_permission
from auth.store import UserRecord, get_by_id, is_token_revoked
from auth.tokens import TokenPayload, verify_token

logger = logging.getLogger(__name__)

# Bearer token extractor — reads "Authorization: Bearer <token>" header.
_bearer = HTTPBearer(auto_error=False)


# ── Core dependency ────────────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UserRecord:
    """
    Validate the Bearer token and return the authenticated user.

    Raises
    ------
    HTTP 401 : No token, invalid token, expired token, or revoked token.
    HTTP 401 : User account is inactive or deleted.
    """
    if credentials is None:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Authentication required. Provide a Bearer token.",
            headers     = {"WWW-Authenticate": "Bearer"},
        )

    payload: TokenPayload | None = verify_token(credentials.credentials, expected_type="access")

    if payload is None:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Invalid or expired token. Please log in again.",
            headers     = {"WWW-Authenticate": "Bearer"},
        )

    if is_token_revoked(payload.jti):
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Token has been revoked. Please log in again.",
            headers     = {"WWW-Authenticate": "Bearer"},
        )

    user = get_by_id(payload.user_id)

    if user is None:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "User account not found.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "User account is deactivated. Contact your administrator.",
        )

    return user


# ── Permission guard factory ───────────────────────────────────────────────────

def require_permission(permission: Permission | str) -> Callable:
    """
    Return a FastAPI dependency that enforces a specific permission.

    Usage:
        user = Depends(require_permission(Permission.INGEST_CREATE))

    Raises HTTP 403 if the authenticated user's role does not have the permission.
    """
    def _check(user: UserRecord = Depends(get_current_user)) -> UserRecord:
        if not has_permission(user.role, permission):
            perm_str = permission.value if isinstance(permission, Permission) else permission
            logger.warning(
                "Permission denied: user=%s  role=%s  required=%s",
                user.username, user.role, perm_str,
            )
            raise HTTPException(
                status_code = status.HTTP_403_FORBIDDEN,
                detail      = (
                    f"Permission denied. Your role ({user.role!r}) does not have "
                    f"'{perm_str}' access. Contact your administrator."
                ),
            )
        return user
    return _check


# ── Optional authentication (for public + authenticated hybrid endpoints) ──────

def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UserRecord | None:
    """
    Like get_current_user but returns None instead of raising 401.
    Use for endpoints that work both authenticated and unauthenticated.
    """
    if credentials is None:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None


# ── Admin-only shortcut ────────────────────────────────────────────────────────

def require_admin(user: UserRecord = Depends(get_current_user)) -> UserRecord:
    """
    Shortcut dependency that requires the ADMIN role exactly.
    Use for endpoints that are admin-only regardless of individual permissions.
    """
    from auth.permissions import Role
    if user.role != Role.ADMIN.value:
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "This endpoint requires administrator access.",
        )
    return user