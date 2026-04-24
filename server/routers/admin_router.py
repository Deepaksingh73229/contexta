"""
routers/admin_router.py — Admin-only user management endpoints.

All endpoints require Permission.ADMIN_USERS (admin role only).

Endpoints
---------
  GET    /admin/users                  List all users.
  POST   /admin/users                  Create a new user.
  GET    /admin/users/{user_id}        Get one user.
  PATCH  /admin/users/{user_id}        Update user (role, active status, name, email).
  DELETE /admin/users/{user_id}        Delete user permanently.
  POST   /admin/users/{user_id}/reset-password  Force-reset a user's password.
  GET    /admin/audit                  View audit log.
  GET    /admin/roles                  List roles + permissions.
"""

from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from auth.dependencies import require_permission
from auth.password import password_meets_policy
from auth.permissions import Permission, all_roles, role_summary, get_permissions_for_role
from auth.store import (
    UserRecord,
    create_user,
    delete_user,
    get_audit_log,
    get_by_id,
    list_users,
    update_user,
    audit,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["Administration"])

# All admin endpoints require ADMIN_USERS permission.
_admin = Depends(require_permission(Permission.ADMIN_USERS))


# ── Request / response models ──────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    username:  str  = Field(..., min_length=3, max_length=40,
                           pattern=r"^[a-zA-Z0-9._-]+$")
    email:     str  = Field(..., min_length=5, max_length=120)
    full_name: str  = Field(..., min_length=1, max_length=120)
    role:      str  = Field(..., description="One of: admin, manager, analyst, viewer")
    password:  str  = Field(..., min_length=8, max_length=128)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in all_roles():
            raise ValueError(f"Invalid role. Must be one of: {all_roles()}")
        return v


class UpdateUserRequest(BaseModel):
    email:     str  | None = None
    full_name: str  | None = None
    role:      str  | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str | None) -> str | None:
        if v is not None and v not in all_roles():
            raise ValueError(f"Invalid role. Must be one of: {all_roles()}")
        return v


class UserResponse(BaseModel):
    user_id:     str
    username:    str
    email:       str
    full_name:   str
    role:        str
    permissions: list[str]
    is_active:   bool
    created_at:  float
    created_by:  str
    updated_at:  float
    last_login:  float | None
    login_count: int


class UserListResponse(BaseModel):
    status: str
    users:  list[UserResponse]
    total:  int


class ResetPasswordResponse(BaseModel):
    status:           str
    temporary_password: str
    message:          str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _to_response(user: UserRecord) -> UserResponse:
    return UserResponse(
        user_id     = user.user_id,
        username    = user.username,
        email       = user.email,
        full_name   = user.full_name,
        role        = user.role,
        permissions = get_permissions_for_role(user.role),
        is_active   = user.is_active,
        created_at  = user.created_at,
        created_by  = user.created_by,
        updated_at  = user.updated_at,
        last_login  = user.last_login,
        login_count = user.login_count,
    )


# ── GET /admin/users ───────────────────────────────────────────────────────────

@router.get("/users", response_model=UserListResponse)
def list_all_users(admin: UserRecord = _admin) -> UserListResponse:
    """List all user accounts with their roles and permissions."""
    users = list_users()
    return UserListResponse(
        status = "success",
        users  = [_to_response(u) for u in users],
        total  = len(users),
    )


# ── POST /admin/users ──────────────────────────────────────────────────────────

@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_new_user(
    req:   CreateUserRequest,
    admin: UserRecord = _admin,
) -> UserResponse:
    """
    Create a new user account.

    The admin sets the initial role and password.
    Passwords must meet the security policy (8+ chars, upper, lower, digit, special).
    """
    ok, reason = password_meets_policy(req.password)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)

    try:
        user = create_user(
            username       = req.username,
            email          = req.email,
            full_name      = req.full_name,
            role           = req.role,
            plain_password = req.password,
            created_by     = admin.user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    audit(admin.user_id, "admin.user_create",
          f"Admin '{admin.username}' created user '{req.username}' with role '{req.role}'")
    logger.info("Admin %s created user %s (role=%s)", admin.username, req.username, req.role)
    return _to_response(user)


# ── GET /admin/users/{user_id} ─────────────────────────────────────────────────

@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: str, admin: UserRecord = _admin) -> UserResponse:
    """Get detailed information about a specific user."""
    user = get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return _to_response(user)


# ── PATCH /admin/users/{user_id} ───────────────────────────────────────────────

@router.patch("/users/{user_id}", response_model=UserResponse)
def update_existing_user(
    user_id: str,
    req:     UpdateUserRequest,
    admin:   UserRecord = _admin,
) -> UserResponse:
    """
    Update a user's profile, role, or active status.

    The admin cannot remove their own admin role.
    """
    user = get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Prevent admin from demoting themselves.
    if user_id == admin.user_id and req.role is not None and req.role != "admin":
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail      = "You cannot change your own admin role.",
        )

    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        return _to_response(user)

    try:
        updated = update_user(user_id, updated_by=admin.user_id, **updates)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit(admin.user_id, "admin.user_update",
          f"Admin '{admin.username}' updated user '{user.username}': {list(updates.keys())}")
    return _to_response(updated)


# ── DELETE /admin/users/{user_id} ──────────────────────────────────────────────

@router.delete("/users/{user_id}", status_code=status.HTTP_200_OK)
def remove_user(user_id: str, admin: UserRecord = _admin) -> dict:
    """
    Permanently delete a user account.

    The admin cannot delete their own account.
    """
    if user_id == admin.user_id:
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail      = "You cannot delete your own account.",
        )
    user = get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    try:
        delete_user(user_id, deleted_by=admin.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit(admin.user_id, "admin.user_delete",
          f"Admin '{admin.username}' deleted user '{user.username}'")
    return {"status": "success", "message": f"User '{user.username}' has been deleted."}


# ── POST /admin/users/{user_id}/reset-password ────────────────────────────────

@router.post("/users/{user_id}/reset-password", response_model=ResetPasswordResponse)
def reset_user_password(user_id: str, admin: UserRecord = _admin) -> ResetPasswordResponse:
    """
    Force-reset a user's password to a random temporary value.

    The admin receives the temporary password in the response.
    The user must change it on next login (policy enforced by the frontend).

    Note: the temporary password is shown ONCE — store it immediately.
    """
    user = get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    temp_password = secrets.token_urlsafe(14)   # e.g. "xK3mR7pQ2nLs9T"
    try:
        update_user(user_id, updated_by=admin.user_id, plain_password=temp_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit(admin.user_id, "admin.password_reset",
          f"Admin '{admin.username}' reset password for user '{user.username}'")
    logger.info("Admin %s reset password for user %s", admin.username, user.username)

    return ResetPasswordResponse(
        status             = "success",
        temporary_password = temp_password,
        message            = (
            f"Password for '{user.username}' has been reset. "
            f"Provide the temporary password to the user — it is shown only once."
        ),
    )


# ── GET /admin/audit ───────────────────────────────────────────────────────────

@router.get("/audit")
def view_audit_log(
    limit:   int         = 100,
    user_id: str | None  = None,
    admin:   UserRecord  = Depends(require_permission(Permission.ADMIN_VIEW_AUDIT)),
) -> dict:
    """
    View the audit log (last N entries, optionally filtered by user_id).

    Each entry contains: ts, user_id, action, detail.
    """
    entries = get_audit_log(limit=limit, user_id=user_id)
    return {"status": "success", "entries": entries, "total": len(entries)}


# ── GET /admin/roles ───────────────────────────────────────────────────────────

@router.get("/roles")
def admin_list_roles(admin: UserRecord = _admin) -> dict:
    """Full role-permission matrix for display in the admin dashboard."""
    return {
        "status":      "success",
        "roles":       all_roles(),
        "permissions": role_summary(),
    }