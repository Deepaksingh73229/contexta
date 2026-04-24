"""
auth/permissions.py — Role-Based Access Control (RBAC) permission registry.

Single source of truth for all roles, permissions, and their relationships.
Adding a new permission means adding it here and to the relevant role sets.
No other file should hardcode permission strings.

Role hierarchy
--------------
  ADMIN   → full control (all permissions)
  MANAGER → can ingest, view progress, list/delete docs, manage cache, cancel tasks
  ANALYST → can query, view docs + citations, view progress
  VIEWER  → query only (no document browsing, no ingestion visibility)

Permission naming convention
-----------------------------
  <resource>:<action>
  Examples: "ingest:create", "admin:users", "documents:delete"
"""

from __future__ import annotations

from enum import Enum


# ── Roles ──────────────────────────────────────────────────────────────────────

class Role(str, Enum):
    ADMIN   = "admin"
    MANAGER = "manager"
    ANALYST = "analyst"
    VIEWER  = "viewer"


# ── All permissions ────────────────────────────────────────────────────────────

class Permission(str, Enum):
    # Ingestion
    INGEST_CREATE        = "ingest:create"         # upload + start ingestion
    INGEST_VIEW_PROGRESS = "ingest:view_progress"  # see task status + SSE stream

    # Documents
    DOCUMENTS_LIST       = "documents:list"        # list all ingested documents
    DOCUMENTS_DELETE     = "documents:delete"      # remove a document from the index

    # Query / search
    QUERY_EXECUTE        = "query:execute"         # run a query against the knowledge base

    # Citations
    CITATIONS_VIEW       = "citations:view"        # stream PDF for inline citation

    # Tasks
    TASKS_CANCEL         = "tasks:cancel"          # cancel or delete a task
    TASKS_VIEW_ALL       = "tasks:view_all"        # see tasks of all users (not just own)

    # Cache management
    CACHE_VIEW           = "cache:view"            # view cache statistics
    CACHE_MANAGE         = "cache:manage"          # clear cache

    # Administration
    ADMIN_USERS          = "admin:users"           # create, update, delete users
    ADMIN_ROLES          = "admin:roles"           # change user roles
    ADMIN_VIEW_AUDIT     = "admin:view_audit"      # view audit log


# ── Role → permission mapping ──────────────────────────────────────────────────

ROLE_PERMISSIONS: dict[Role, set[Permission]] = {

    Role.ADMIN: set(Permission),   # all permissions

    Role.MANAGER: {
        Permission.INGEST_CREATE,
        Permission.INGEST_VIEW_PROGRESS,
        Permission.DOCUMENTS_LIST,
        Permission.DOCUMENTS_DELETE,
        Permission.QUERY_EXECUTE,
        Permission.CITATIONS_VIEW,
        Permission.TASKS_CANCEL,
        Permission.TASKS_VIEW_ALL,
        Permission.CACHE_VIEW,
        Permission.CACHE_MANAGE,
    },

    Role.ANALYST: {
        Permission.INGEST_VIEW_PROGRESS,
        Permission.DOCUMENTS_LIST,
        Permission.QUERY_EXECUTE,
        Permission.CITATIONS_VIEW,
        Permission.CACHE_VIEW,
    },

    Role.VIEWER: {
        Permission.QUERY_EXECUTE,
        Permission.CITATIONS_VIEW,
    },
}


# ── RBAC check functions ───────────────────────────────────────────────────────

def has_permission(role: Role | str, permission: Permission | str) -> bool:
    """
    Return True if `role` has `permission`.

    Parameters
    ----------
    role       : Role enum or string (e.g. "admin", "viewer").
    permission : Permission enum or string (e.g. "ingest:create").
    """
    try:
        r = Role(role)
        p = Permission(permission)
    except ValueError:
        return False
    return p in ROLE_PERMISSIONS.get(r, set())


def get_permissions_for_role(role: Role | str) -> list[str]:
    """Return sorted list of permission strings for a given role."""
    try:
        r = Role(role)
    except ValueError:
        return []
    return sorted(p.value for p in ROLE_PERMISSIONS.get(r, set()))


def all_roles() -> list[str]:
    return [r.value for r in Role]


def role_summary() -> dict[str, list[str]]:
    """Return a full role → permissions map (used by admin API)."""
    return {
        role.value: sorted(p.value for p in perms)
        for role, perms in ROLE_PERMISSIONS.items()
    }