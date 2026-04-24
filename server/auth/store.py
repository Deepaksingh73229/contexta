"""
auth/store.py — Persistent user registry (JSON-on-disk, thread-safe).

Stores user records in AUTH_DIR/users.json.
Stores audit log in AUTH_DIR/audit.log (append-only JSONL).
Stores revoked JTIs in AUTH_DIR/revoked_tokens.json.

Fully offline — no database required.

User record format
------------------
{
  "user_id":     "uuid4_hex",
  "username":    "john.doe",
  "email":       "john@example.com",
  "full_name":   "John Doe",
  "role":        "analyst",
  "password_hash": "$2b$12$...",
  "is_active":   true,
  "created_at":  1712345678.0,
  "created_by":  "admin_user_id",
  "updated_at":  1712345678.0,
  "last_login":  1712345678.0,
  "login_count": 42
}

Public surface
--------------
  create_user(username, email, full_name, role, plain_password, created_by)
      → UserRecord
  get_by_id(user_id)       → UserRecord | None
  get_by_username(username) → UserRecord | None
  update_user(user_id, **fields) → UserRecord
  delete_user(user_id)     → None
  list_users()             → list[UserRecord]
  record_login(user_id)    → None
  revoke_token(jti)        → None
  is_token_revoked(jti)    → bool
  audit(user_id, action, detail) → None
  get_audit_log(limit)     → list[dict]
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from auth.password import hash_password
from auth.permissions import Role
from config import AUTH_DIR

logger = logging.getLogger(__name__)

AUTH_DIR.mkdir(parents=True, exist_ok=True)

_USERS_FILE:   Path = AUTH_DIR / "users.json"
_AUDIT_FILE:   Path = AUTH_DIR / "audit.log"
_REVOKED_FILE: Path = AUTH_DIR / "revoked_tokens.json"

_lock = threading.Lock()


# ── User record ────────────────────────────────────────────────────────────────

@dataclass
class UserRecord:
    user_id:       str
    username:      str
    email:         str
    full_name:     str
    role:          str
    password_hash: str
    is_active:     bool  = True
    created_at:    float = field(default_factory=time.time)
    created_by:    str   = "system"
    updated_at:    float = field(default_factory=time.time)
    last_login:    float | None = None
    login_count:   int   = 0

    def to_dict(self) -> dict:
        return asdict(self)

    def to_public(self) -> dict:
        """Return a safe dict with NO password hash — for API responses."""
        d = self.to_dict()
        d.pop("password_hash", None)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "UserRecord":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in d.items() if k in known})


# ── In-memory stores ───────────────────────────────────────────────────────────

_users:   dict[str, UserRecord] = {}   # user_id → UserRecord
_revoked: set[str]               = set()   # revoked JTI strings


def _load_users() -> None:
    if not _USERS_FILE.exists():
        return
    try:
        data = json.loads(_USERS_FILE.read_text(encoding="utf-8"))
        for d in data.values():
            rec = UserRecord.from_dict(d)
            _users[rec.user_id] = rec
        logger.info("User store loaded: %d users.", len(_users))
    except Exception as exc:
        logger.warning("Could not load user store: %s", exc)


def _save_users() -> None:
    try:
        _USERS_FILE.write_text(
            json.dumps({uid: u.to_dict() for uid, u in _users.items()},
                       indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("Could not persist user store: %s", exc)


def _load_revoked() -> None:
    global _revoked
    if not _REVOKED_FILE.exists():
        return
    try:
        _revoked = set(json.loads(_REVOKED_FILE.read_text(encoding="utf-8")))
    except Exception:
        pass


def _save_revoked() -> None:
    try:
        _REVOKED_FILE.write_text(json.dumps(list(_revoked)), encoding="utf-8")
    except Exception:
        pass


_load_users()
_load_revoked()


# ── Bootstrap: create default admin on first run ───────────────────────────────

def _bootstrap_admin() -> None:
    """
    Create a default admin account if no users exist.

    Credentials printed to server log on first run only.
    Admin MUST change the password immediately after first login.
    """
    if _users:
        return   # users already exist — skip

    import secrets as _sec
    temp_password = _sec.token_urlsafe(12)   # e.g. "aX3kR7mQpL2n"

    user_id = uuid.uuid4().hex
    admin = UserRecord(
        user_id       = user_id,
        username      = "admin",
        email         = "admin@local",
        full_name     = "System Administrator",
        role          = Role.ADMIN.value,
        password_hash = hash_password(temp_password),
        is_active     = True,
        created_by    = "system",
    )
    _users[user_id] = admin
    _save_users()

    # Print to log — admin reads this on first startup.
    logger.warning("=" * 60)
    logger.warning("FIRST RUN — default admin account created:")
    logger.warning("  Username : admin")
    logger.warning("  Password : %s", temp_password)
    logger.warning("  ACTION REQUIRED: Change this password immediately!")
    logger.warning("=" * 60)


_bootstrap_admin()


# ── Public API ─────────────────────────────────────────────────────────────────

def create_user(
    username:       str,
    email:          str,
    full_name:      str,
    role:           str,
    plain_password: str,
    created_by:     str = "system",
) -> UserRecord:
    """
    Create a new user account.

    Raises ValueError if username or email is already taken.
    """
    with _lock:
        # Check uniqueness.
        for u in _users.values():
            if u.username.lower() == username.lower():
                raise ValueError(f"Username '{username}' is already taken.")
            if u.email.lower() == email.lower():
                raise ValueError(f"Email '{email}' is already registered.")

        # Validate role.
        try:
            Role(role)
        except ValueError:
            raise ValueError(f"Invalid role '{role}'. Valid roles: {[r.value for r in Role]}")

        user_id = uuid.uuid4().hex
        rec = UserRecord(
            user_id       = user_id,
            username      = username.strip(),
            email         = email.strip().lower(),
            full_name     = full_name.strip(),
            role          = role,
            password_hash = hash_password(plain_password),
            is_active     = True,
            created_by    = created_by,
        )
        _users[user_id] = rec
        _save_users()

    audit(created_by, "user.create", f"Created user '{username}' with role '{role}'")
    logger.info("User created: user_id=%s  username=%s  role=%s", user_id, username, role)
    return rec


def get_by_id(user_id: str) -> UserRecord | None:
    with _lock:
        return _users.get(user_id)


def get_by_username(username: str) -> UserRecord | None:
    with _lock:
        for u in _users.values():
            if u.username.lower() == username.lower():
                return u
    return None


def update_user(user_id: str, updated_by: str = "system", **fields: Any) -> UserRecord:
    """
    Update user fields.

    Updatable fields: email, full_name, role, is_active, plain_password.
    Pass plain_password to update the password (hashed automatically).
    """
    with _lock:
        rec = _users.get(user_id)
        if rec is None:
            raise ValueError(f"User '{user_id}' not found.")

        if "plain_password" in fields:
            fields["password_hash"] = hash_password(fields.pop("plain_password"))

        if "role" in fields:
            try:
                Role(fields["role"])
            except ValueError:
                raise ValueError(f"Invalid role '{fields['role']}'.")

        for k, v in fields.items():
            if hasattr(rec, k) and k not in ("user_id", "created_at", "created_by", "login_count"):
                setattr(rec, k, v)

        rec.updated_at = time.time()
        _save_users()

    audit(updated_by, "user.update", f"Updated user '{rec.username}': {list(fields.keys())}")
    return rec


def delete_user(user_id: str, deleted_by: str = "system") -> None:
    """Soft-delete: mark inactive. Hard delete removes from store entirely."""
    with _lock:
        rec = _users.pop(user_id, None)
        if rec is None:
            raise ValueError(f"User '{user_id}' not found.")
        _save_users()
    audit(deleted_by, "user.delete", f"Deleted user '{rec.username}'")
    logger.info("User deleted: user_id=%s  by=%s", user_id, deleted_by)


def list_users() -> list[UserRecord]:
    with _lock:
        return sorted(_users.values(), key=lambda u: u.created_at)


def record_login(user_id: str) -> None:
    with _lock:
        rec = _users.get(user_id)
        if rec:
            rec.last_login  = time.time()
            rec.login_count += 1
            _save_users()


def change_password(
    user_id:       str,
    old_password:  str,
    new_password:  str,
    changed_by:    str,
) -> None:
    """Authenticated password change — verifies old password before updating."""
    from auth.password import verify_password
    rec = get_by_id(user_id)
    if rec is None:
        raise ValueError("User not found.")
    if not verify_password(old_password, rec.password_hash):
        raise ValueError("Current password is incorrect.")
    update_user(user_id, updated_by=changed_by, plain_password=new_password)
    audit(changed_by, "user.password_change", f"Password changed for user '{rec.username}'")


# ── Token revocation ───────────────────────────────────────────────────────────

def revoke_token(jti: str) -> None:
    """Add a token's JTI to the revocation list (logout)."""
    with _lock:
        _revoked.add(jti)
        _save_revoked()


def is_token_revoked(jti: str) -> bool:
    with _lock:
        return jti in _revoked


# ── Audit log ──────────────────────────────────────────────────────────────────

def audit(user_id: str, action: str, detail: str = "") -> None:
    """
    Append an audit event to the append-only audit log.

    Format: one JSON object per line (JSONL) for easy grep/parsing.
    """
    entry = {
        "ts":      time.time(),
        "user_id": user_id,
        "action":  action,
        "detail":  detail,
    }
    try:
        with open(_AUDIT_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as exc:
        logger.warning("Audit write failed: %s", exc)


def get_audit_log(limit: int = 100, user_id: str | None = None) -> list[dict]:
    """Read the most recent `limit` audit entries, optionally filtered by user_id."""
    if not _AUDIT_FILE.exists():
        return []
    try:
        lines = _AUDIT_FILE.read_text(encoding="utf-8").strip().splitlines()
        entries = []
        for line in reversed(lines):
            try:
                e = json.loads(line)
                if user_id and e.get("user_id") != user_id:
                    continue
                entries.append(e)
                if len(entries) >= limit:
                    break
            except Exception:
                continue
        return entries
    except Exception:
        return []