"""
routers/auth_router.py — Authentication endpoints.

Endpoints
---------
  POST /auth/login              Username + password → access + refresh tokens.
  POST /auth/logout             Revoke the current access token.
  POST /auth/refresh            Exchange refresh token → new access token.
  GET  /auth/me                 Return current user profile.
  POST /auth/me/change-password Change own password.
  GET  /auth/roles              List all roles and their permissions (public).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from auth.dependencies import get_current_user
from auth.password import verify_password, password_meets_policy
from auth.permissions import role_summary, all_roles, get_permissions_for_role
from auth.store import (
    UserRecord, get_by_username, record_login, revoke_token, audit,
    change_password,
)
from auth.tokens import create_token_pair, verify_token, create_access_token

logger  = logging.getLogger(__name__)
router  = APIRouter(prefix="/auth", tags=["Authentication"])
_bearer = HTTPBearer(auto_error=False)


# ── Request / response models ──────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str   = "bearer"
    expires_in:    int           # seconds until access token expires
    user_id:       str
    username:      str
    role:          str
    permissions:   list[str]     # flat list of permission strings for this role


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password:     str = Field(..., min_length=8)


class UserProfileResponse(BaseModel):
    user_id:     str
    username:    str
    email:       str
    full_name:   str
    role:        str
    permissions: list[str]
    is_active:   bool
    last_login:  float | None
    login_count: int


# ── Helpers ────────────────────────────────────────────────────────────────────

def _user_to_profile(user: UserRecord) -> UserProfileResponse:
    return UserProfileResponse(
        user_id     = user.user_id,
        username    = user.username,
        email       = user.email,
        full_name   = user.full_name,
        role        = user.role,
        permissions = get_permissions_for_role(user.role),
        is_active   = user.is_active,
        last_login  = user.last_login,
        login_count = user.login_count,
    )


# ── POST /auth/login ───────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest) -> TokenResponse:
    """
    Authenticate with username and password.

    Returns an access token (short-lived) and a refresh token (long-lived).
    Pass the access token as: Authorization: Bearer <access_token>

    On failure returns HTTP 401 — intentionally vague ("invalid credentials")
    to prevent username enumeration.
    """
    _INVALID = HTTPException(
        status_code = status.HTTP_401_UNAUTHORIZED,
        detail      = "Invalid username or password.",
        headers     = {"WWW-Authenticate": "Bearer"},
    )

    user = get_by_username(req.username)
    if user is None:
        raise _INVALID

    if not user.is_active:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Account is deactivated. Contact your administrator.",
        )

    if not verify_password(req.password, user.password_hash):
        audit(user.user_id, "auth.login_failed", f"Failed login attempt for '{req.username}'")
        raise _INVALID

    pair = create_token_pair(user.user_id, user.role)
    record_login(user.user_id)
    audit(user.user_id, "auth.login", f"User '{user.username}' logged in")

    logger.info("Login: user=%s  role=%s", user.username, user.role)

    return TokenResponse(
        access_token  = pair.access_token,
        refresh_token = pair.refresh_token,
        token_type    = "bearer",
        expires_in    = pair.expires_in,
        user_id       = user.user_id,
        username      = user.username,
        role          = user.role,
        permissions   = get_permissions_for_role(user.role),
    )


# ── POST /auth/logout ──────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    current_user: UserRecord = Depends(get_current_user),
) -> dict:
    """
    Revoke the current access token.

    The token's JTI is added to the revocation set — all subsequent requests
    with this token will receive HTTP 401 immediately.
    """
    if credentials:
        payload = verify_token(credentials.credentials)
        if payload:
            revoke_token(payload.jti)

    audit(current_user.user_id, "auth.logout", f"User '{current_user.username}' logged out")
    logger.info("Logout: user=%s", current_user.username)
    return {"status": "success", "message": "Logged out successfully."}


# ── POST /auth/refresh ─────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
def refresh_token_endpoint(req: RefreshRequest) -> TokenResponse:
    """
    Exchange a valid refresh token for a new access token.

    The refresh token is NOT revoked — it can be reused until it expires.
    """
    from auth.store import get_by_id
    payload = verify_token(req.refresh_token, expected_type="refresh")

    if payload is None:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Invalid or expired refresh token. Please log in again.",
        )

    user = get_by_id(payload.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "User account not found or deactivated.",
        )

    new_access = create_access_token(user.user_id, user.role)
    # Also create a fresh refresh token (sliding expiry).
    pair = create_token_pair(user.user_id, user.role)

    audit(user.user_id, "auth.token_refresh", "Access token refreshed")

    return TokenResponse(
        access_token  = pair.access_token,
        refresh_token = pair.refresh_token,
        token_type    = "bearer",
        expires_in    = pair.expires_in,
        user_id       = user.user_id,
        username      = user.username,
        role          = user.role,
        permissions   = get_permissions_for_role(user.role),
    )


# ── GET /auth/me ───────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserProfileResponse)
def get_me(current_user: UserRecord = Depends(get_current_user)) -> UserProfileResponse:
    """Return the authenticated user's profile and permission list."""
    return _user_to_profile(current_user)


# ── POST /auth/me/change-password ─────────────────────────────────────────────

@router.post("/me/change-password", status_code=status.HTTP_200_OK)
def change_own_password(
    req:          ChangePasswordRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> dict:
    """
    Change your own password.

    Requires the current password for verification.
    The new password must meet the security policy (8+ chars, upper, lower, digit, special).
    """
    ok, reason = password_meets_policy(req.new_password)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)

    try:
        change_password(
            user_id      = current_user.user_id,
            old_password = req.current_password,
            new_password = req.new_password,
            changed_by   = current_user.user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return {"status": "success", "message": "Password changed successfully."}


# ── GET /auth/roles ────────────────────────────────────────────────────────────

@router.get("/roles")
def list_roles() -> dict:
    """
    Return all roles and their associated permissions.
    Public endpoint — no authentication required.
    Useful for the frontend to build role-selection dropdowns.
    """
    return {
        "roles":       all_roles(),
        "permissions": role_summary(),
    }