# Contexta Enterprise API — Full Documentation & Bug Report

> Version: 4.0.0 | Fully offline enterprise RAG backend  
> Base URL: `http://localhost:8000`  
> Auth: JWT Bearer tokens (HS256, offline)

---

## Table of Contents

1. [Bugs Found & Fixes](#bugs-found--fixes)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
   - [Health](#health)
   - [Auth Routes](#auth-routes)
   - [Ingestion Routes](#ingestion-routes)
   - [Task Management Routes](#task-management-routes)
   - [Query Routes](#query-routes)
   - [Citation Routes](#citation-routes)
   - [Admin Routes](#admin-routes)
4. [Data Models Reference](#data-models-reference)
5. [Error Codes Reference](#error-codes-reference)
6. [Quick Start Examples](#quick-start-examples)

---

## Bugs Found & Fixes

### Bug 1 — `vectorless_rag.py`: Typo in `re.MULTLINE` flag
**File:** `server/vectorless_rag.py`, line in `_has_meaningful_content()`  
**Severity:** 🔴 Critical (runtime crash)

```python
# BUGGY
stripped = re.sub(r"^#+\s+.*$", "", text, flags = re.MULTLINE).strip()

# FIXED
stripped = re.sub(r"^#+\s+.*$", "", text, flags=re.MULTILINE).strip()
```
`re.MULTLINE` does not exist — Python raises `AttributeError` at runtime. The correct flag is `re.MULTILINE`. This bug is already fixed in `vectorless_rag1.py` and `core/builder.py` but remains in the original `vectorless_rag.py`.

---

### Bug 2 — `vectorless_rag.py`: Wrong field name `res` in `_dict_to_node()`
**File:** `server/vectorless_rag.py`, `_dict_to_node()`  
**Severity:** 🔴 Critical (runtime crash on tree load)

```python
# BUGGY
return TreeNode(
    title   = d["title"],
    node_id = d["node_id"],
    content = d.get("content", ""),
    summary = d.get("summary", ""),
    res     = [_dict_to_node(n) for n in d.get("nodes", [])],  # 'res' doesn't exist
)

# FIXED
return TreeNode(
    title   = d["title"],
    node_id = d["node_id"],
    content = d.get("content", ""),
    summary = d.get("summary", ""),
    nodes   = [_dict_to_node(n) for n in d.get("nodes", [])],  # correct field name
)
```
`TreeNode` has no field named `res`. This causes a `TypeError` whenever a saved tree is loaded back from disk.

---

### Bug 3 — `vectorless_rag.py`: Undefined variable `TREEE_SEARCH_PROMPT` (triple-E typo)
**File:** `server/vectorless_rag.py`, `tree_search()`  
**Severity:** 🔴 Critical (runtime `NameError`)

```python
# BUGGY
prompt = TREEE_SEARCH_PROMPT.format(query=query, tree_index=tree_index)

# FIXED
prompt = TREE_SEARCH_PROMPT.format(query=query, tree_index=tree_index)
```
`TREEE_SEARCH_PROMPT` is never defined — Python raises `NameError`. The correct variable is `TREE_SEARCH_PROMPT`.

---

### Bug 4 — `vectorless_rag.py`: `model.invoke()` used like LangChain but model is raw Ollama
**File:** `server/vectorless_rag.py`, top-level model initialisation  
**Severity:** 🟠 High (import error / wrong API)

```python
# BUGGY — langchain.chat.models doesn't exist in modern LangChain
from langchain.chat.models import init_chat_model

# FIXED — use the correct modern import
from langchain.chat_models import init_chat_model
# OR use the ollama package directly (as done in vectorless_rag1.py)
```
`langchain.chat.models` is not a valid module path. The package is `langchain.chat_models` (no dot before `models`). This prevents the file from importing at all.

---

### Bug 5 — `vectorless_rag.py`: Shared `model` and `search_model` used for both summary and structured output
**File:** `server/vectorless_rag.py`  
**Severity:** 🟠 High (logical error — structured output model used for plain text summary)

```python
# BUGGY — model.with_structured_output() wraps the model permanently
search_model = model.with_structured_output(TreeSearchResult)
# Then later in summarize_tree():
node.summary = model.invoke(prompt).content.strip()  # fine
# But search_model is also used for plain text calls elsewhere — wrong model for those paths
```
`with_structured_output()` returns a new chain that forces JSON schema output. Using it for non-JSON generation tasks produces broken output. The two concerns should be separated, as correctly done in `vectorless_rag1.py`.

---

### Bug 6 — `citations.py`: `doc_id` validation rejects valid UUIDs containing uppercase hex
**File:** `server/citations.py`, `_resolve_doc()`  
**Severity:** 🟡 Medium (overly strict validation — valid UUIDs rejected)

```python
# BUGGY — uuid4().hex always returns lowercase, but the check is unnecessarily fragile
if not doc_id.isalnum() or not doc_id.islower() or len(doc_id) != 32:

# FIXED — cleaner validation
import re
if not re.fullmatch(r'[0-9a-f]{32}', doc_id):
    raise HTTPException(...)
```
`str.islower()` returns `False` for strings containing digits only (e.g., `"12345678901234567890123456789012"` — all digits, no letters, so `islower()` is `False`). A UUID hex with no alphabetic characters would be incorrectly rejected. Use a regex match instead.

---

### Bug 7 — `auth_data/secret.key` committed to source
**File:** `server/auth_data/secret.key`  
**Severity:** 🔴 Critical (security — private JWT signing key exposed)

The JWT signing secret key `e6bd0555ea86432ecc00f97c9ee0295b439f248a4e55f98cbacc2df11f89fce3` is committed to the repository. This allows anyone with repo access to forge valid JWT tokens for any user.

**Fix:** Add `auth_data/` to `.gitignore` immediately and rotate the key by deleting the file and restarting the server.

```gitignore
# Add to .gitignore
auth_data/
documents/
tree_indexes/
query_cache/
tasks/
chroma_db/
temp_uploads/
```

---

### Bug 8 — `auth_data/users.json` committed to source
**File:** `server/auth_data/users.json`  
**Severity:** 🔴 Critical (security — bcrypt password hash exposed)

The admin password hash is committed to the repository. While bcrypt is slow to crack, this still enables offline brute-force. Add `auth_data/` to `.gitignore` (same fix as Bug 7).

---

### Bug 9 — `ingest.py` (old): `OllamaEmbeddings` + `Chroma` re-initialised per request in `ingest1.py`
**File:** `server/ingest1.py`  
**Severity:** 🟡 Medium (performance — concurrent write conflicts on Chroma)

```python
# BUGGY — creates a new Chroma client on every request
vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=local_embeddings,
    persist_directory=CHROMA_DB_DIR
)
```
This is fixed in the production `ingest.py` with module-level singletons, but `ingest1.py` is still present and would cause issues if accidentally used.

---

### Bug 10 — `services/ingestion_pipeline.py`: `_parallel_summarise` bottom-up order not truly guaranteed
**File:** `server/services/ingestion_pipeline.py`, `_parallel_summarise()`  
**Severity:** 🟡 Medium (logic — parent may be summarised before children in edge cases)

The code assigns depths and processes level by level deepest-first, which is correct. However, `all_nodes = tree.all_nodes()` returns nodes in DFS pre-order (parent before children). The `depth_map` lookup depends on `_assign_depths_map` being called before the loop. This is currently correct but fragile — if the depth map is incomplete (e.g. orphaned node), nodes fall to depth 0 and get processed last instead of first.

**Fix:** Assert that all nodes in `all_nodes` are present in `depth_map` after building it, and log a warning for any that aren't.

---

### Bug 11 — `vectorless_rag.py`: Queries list is named `quaries` (typo)
**File:** `server/vectorless_rag.py`, bottom of file  
**Severity:** 🟢 Low (typo — works fine but misleading)

```python
# BUGGY
quaries = ["What was NVIDIA's total revenue..."]

# FIXED
queries = ["What was NVIDIA's total revenue..."]
```

---

### Bug 12 — `chat.py`: Uses `langchain_classic` which is not a real package
**File:** `server/chat.py`  
**Severity:** 🔴 Critical (import error — server won't start)

```python
# BUGGY — no such package
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain

# FIXED — correct package names
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
```
`langchain_classic` does not exist on PyPI. The correct packages are `langchain` (for chains) or `langchain_community`. This prevents `chat.py` from being imported at all, breaking the old `vectored_main.py` entrypoint.

---

### Summary Table

| # | File | Severity | Type | Status |
|---|------|----------|------|--------|
| 1 | `vectorless_rag.py` | 🔴 Critical | Runtime crash (`re.MULTLINE`) | Fix: `re.MULTILINE` |
| 2 | `vectorless_rag.py` | 🔴 Critical | Runtime crash (`res=` field) | Fix: `nodes=` |
| 3 | `vectorless_rag.py` | 🔴 Critical | `NameError` (`TREEE_`) | Fix: `TREE_SEARCH_PROMPT` |
| 4 | `vectorless_rag.py` | 🟠 High | Import error (wrong LangChain path) | Fix: correct import |
| 5 | `vectorless_rag.py` | 🟠 High | Logical error (model reuse) | Fix: separate models |
| 6 | `citations.py` | 🟡 Medium | Validation rejects digit-only UUIDs | Fix: regex match |
| 7 | `auth_data/secret.key` | 🔴 Critical | Security — key committed to repo | Fix: `.gitignore` + rotate |
| 8 | `auth_data/users.json` | 🔴 Critical | Security — hash committed to repo | Fix: `.gitignore` |
| 9 | `ingest1.py` | 🟡 Medium | Chroma re-init per request | Fix: remove stale file |
| 10 | `ingestion_pipeline.py` | 🟡 Medium | Fragile depth-map ordering | Fix: assert + log |
| 11 | `vectorless_rag.py` | 🟢 Low | Typo `quaries` | Fix: rename |
| 12 | `chat.py` | 🔴 Critical | Import error (`langchain_classic`) | Fix: `langchain` |

---

---

## Authentication

All endpoints except `/`, `/auth/login`, `/auth/roles`, and `/api/ingest/health` require a JWT Bearer token.

### How to authenticate

**Step 1 — Login**
```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

**Step 2 — Use the token**
```http
Authorization: Bearer <access_token>
```

### Token lifecycle

| Token | Lifetime | Purpose |
|-------|----------|---------|
| `access_token` | 30 minutes | Sent with every API request |
| `refresh_token` | 7 days | Exchange for a new access token |

### Role hierarchy & permissions

| Permission | admin | manager | analyst | viewer |
|------------|:-----:|:-------:|:-------:|:------:|
| `ingest:create` | ✅ | ✅ | ❌ | ❌ |
| `ingest:view_progress` | ✅ | ✅ | ✅ | ❌ |
| `documents:list` | ✅ | ✅ | ✅ | ❌ |
| `documents:delete` | ✅ | ✅ | ❌ | ❌ |
| `query:execute` | ✅ | ✅ | ✅ | ✅ |
| `citations:view` | ✅ | ✅ | ✅ | ✅ |
| `tasks:cancel` | ✅ | ✅ | ❌ | ❌ |
| `cache:view` | ✅ | ✅ | ✅ | ❌ |
| `cache:manage` | ✅ | ✅ | ❌ | ❌ |
| `admin:users` | ✅ | ❌ | ❌ | ❌ |
| `admin:view_audit` | ✅ | ❌ | ❌ | ❌ |

---

---

## API Endpoints

---

## Health

### `GET /`

Health check. No authentication required.

**Request**
```http
GET / HTTP/1.1
Host: localhost:8000
```

**Response `200 OK`**
```json
{
  "status": "active",
  "message": "Contexta Enterprise API is running.",
  "version": "4.0.0",
  "active_tasks": 0,
  "auth": "JWT Bearer (offline, HS256)"
}
```

---

---

## Auth Routes

Base prefix: `/auth`

---

### `POST /auth/login`

Exchange username + password for access and refresh tokens.  
**No authentication required.**

**Request**
```http
POST /auth/login HTTP/1.1
Content-Type: application/json
```

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `username` | string | ✅ | 1–80 chars |
| `password` | string | ✅ | 1–128 chars |

```json
{
  "username": "admin",
  "password": "MyP@ssw0rd!"
}
```

**Response `200 OK`**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user_id": "15fa24cc295947929a97f35bf2a26eec",
  "username": "admin",
  "role": "admin",
  "permissions": ["admin:roles", "admin:users", "admin:view_audit", "cache:manage", "..."]
}
```

**Error responses**

| Code | Condition |
|------|-----------|
| `401` | Invalid credentials or deactivated account |

---

### `POST /auth/logout`

Revoke the current access token (add its JTI to revocation list).  
**Requires:** Any valid Bearer token.

**Request**
```http
POST /auth/logout HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`**
```json
{
  "status": "success",
  "message": "Logged out successfully."
}
```

---

### `POST /auth/refresh`

Exchange a refresh token for a new access + refresh token pair.  
**No authentication header required — pass refresh token in body.**

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `refresh_token` | string | ✅ |

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response `200 OK`** — same structure as `/auth/login`

**Error responses**

| Code | Condition |
|------|-----------|
| `401` | Invalid/expired refresh token or deactivated user |

---

### `GET /auth/me`

Return the authenticated user's profile.  
**Requires:** Any valid Bearer token.

**Request**
```http
GET /auth/me HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`**
```json
{
  "user_id": "15fa24cc295947929a97f35bf2a26eec",
  "username": "admin",
  "email": "admin@local",
  "full_name": "System Administrator",
  "role": "admin",
  "permissions": ["admin:roles", "admin:users", "..."],
  "is_active": true,
  "last_login": 1712345678.0,
  "login_count": 42
}
```

---

### `POST /auth/me/change-password`

Change your own password. Requires current password for verification.  
**Requires:** Any valid Bearer token.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `current_password` | string | ✅ | min 1 char |
| `new_password` | string | ✅ | min 8 chars + policy |

Password policy: 8+ chars, at least one uppercase, lowercase, digit, and special character.

```json
{
  "current_password": "OldP@ssw0rd!",
  "new_password": "NewP@ssw0rd#2024"
}
```

**Response `200 OK`**
```json
{
  "status": "success",
  "message": "Password changed successfully."
}
```

**Error responses**

| Code | Condition |
|------|-----------|
| `400` | Password policy violation or wrong current password |

---

### `GET /auth/roles`

List all roles and their permissions.  
**No authentication required.**

**Response `200 OK`**
```json
{
  "roles": ["admin", "manager", "analyst", "viewer"],
  "permissions": {
    "admin": ["admin:roles", "admin:users", "..."],
    "manager": ["cache:manage", "documents:delete", "..."],
    "analyst": ["cache:view", "citations:view", "..."],
    "viewer": ["citations:view", "query:execute"]
  }
}
```

---

---

## Ingestion Routes

Base prefix: `/api/ingest`

---

### `GET /api/ingest/health`

Ingestion service liveness probe.  
**No authentication required.**

**Response `200 OK`**
```json
{
  "status": "active",
  "message": "Ingestion service is running."
}
```

---

### `POST /api/ingest`

Upload a PDF and start background ingestion.  
**Requires:** `ingest:create` permission (admin, manager)  
Returns `HTTP 202 Accepted` immediately. Processing happens in the background.

**Request**
```http
POST /api/ingest HTTP/1.1
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**Form fields**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `file` | PDF file | ✅ | Max 50 MB, must be a valid PDF |

**Example (curl)**
```bash
curl -X POST http://localhost:8000/api/ingest \
  -H "Authorization: Bearer <access_token>" \
  -F "file=@/path/to/document.pdf"
```

**Example (Python)**
```python
import httpx

with open("document.pdf", "rb") as f:
    response = httpx.post(
        "http://localhost:8000/api/ingest",
        headers={"Authorization": f"Bearer {access_token}"},
        files={"file": ("document.pdf", f, "application/pdf")}
    )
data = response.json()
task_id = data["task_id"]
doc_id = data["doc_id"]
```

**Response `202 Accepted`**
```json
{
  "status": "accepted",
  "task_id": "a3f1c2d4e5b6a7c8d9e0f1a2b3c4d5e6",
  "doc_id": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
  "filename": "document.pdf",
  "message": "'document.pdf' uploaded successfully. Processing in background. Poll /api/tasks/a3f1c2d4e5b6a7c8d9e0f1a2b3c4d5e6 for progress."
}
```

**Error responses**

| Code | Condition |
|------|-----------|
| `400` | Not a PDF extension or invalid magic bytes |
| `401` | Missing or invalid token |
| `403` | Insufficient permissions |
| `413` | File exceeds 50 MB |
| `415` | Wrong Content-Type (not `application/pdf` or `application/octet-stream`) |

**Pipeline stages (tracked via tasks endpoint)**

```
queued (0%) → uploaded (5%) → markdown (10%) → tree_built (20%)
→ summarising (20%→70%, per-node) → embedded (80%) → indexed (90%) → done (100%)
```

---

---

## Task Management Routes

Base prefix: `/api/tasks`  
**Requires:** `ingest:view_progress` permission (admin, manager, analyst)

---

### `GET /api/tasks`

List ingestion tasks.

**Query parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `include_done` | boolean | `false` | Include completed/failed/cancelled tasks |

**Request**
```http
GET /api/tasks?include_done=true HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`**
```json
{
  "status": "success",
  "total": 2,
  "tasks": [
    {
      "task_id": "a3f1c2d4e5b6a7c8d9e0f1a2b3c4d5e6",
      "doc_id": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
      "filename": "document.pdf",
      "status": "running",
      "stage": "summarising",
      "stage_label": "Summarising sections",
      "pct": 42.3,
      "total_nodes": 47,
      "nodes_done": 20,
      "eta_seconds": 324.0,
      "current_node": "Chapter 3 — Post-Operative Care",
      "elapsed_seconds": 187.4,
      "error": null,
      "created_at": 1712345678.0,
      "started_at": 1712345680.0,
      "completed_at": null
    }
  ]
}
```

---

### `GET /api/tasks/{task_id}`

Get live status for a single task. Poll this every 1–2 seconds for a progress bar.

**Path parameters**

| Param | Type | Description |
|-------|------|-------------|
| `task_id` | string (32-char hex) | Task ID returned by `/api/ingest` |

**Request**
```http
GET /api/tasks/a3f1c2d4e5b6a7c8d9e0f1a2b3c4d5e6 HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`** — single `TaskStatusResponse` object (same shape as array items above)

**Status values**

| Status | Meaning |
|--------|---------|
| `queued` | Waiting for a worker thread |
| `running` | Currently processing |
| `done` | Successfully completed |
| `failed` | An error occurred |
| `cancelled` | Cancelled by user |
| `interrupted` | Process died mid-task; will auto-resume on restart |

**Stage labels**

| Stage | Label |
|-------|-------|
| `queued` | Queued |
| `uploaded` | File uploaded |
| `markdown` | Converting PDF |
| `tree_built` | Structure ready |
| `summarising` | Summarising sections |
| `summarised` | Sections summarised |
| `embedding` | Generating embeddings |
| `embedded` | Embeddings ready |
| `indexing` | Building search index |
| `indexed` | Index ready |
| `done` | Complete |
| `failed` | Failed |
| `cancelled` | Cancelled |

**Error responses**

| Code | Condition |
|------|-----------|
| `404` | Task ID not found |

---

### `GET /api/tasks/{task_id}/stream`

Server-Sent Events (SSE) stream for real-time progress. Pushes one JSON event per second until the task reaches a terminal state.

**Request**
```http
GET /api/tasks/a3f1c2d4e5b6a7c8d9e0f1a2b3c4d5e6/stream HTTP/1.1
Authorization: Bearer <access_token>
Accept: text/event-stream
```

**SSE event format (one per second)**
```
data: {"task_id":"a3f1...","status":"running","stage":"summarising","stage_label":"Summarising sections","pct":42.3,"nodes_done":20,"total_nodes":47,"eta_seconds":324,"current_node":"Chapter 3","elapsed_s":187.4,"error":null}
```

**Frontend usage (JavaScript)**
```javascript
const es = new EventSource(
  `/api/tasks/${taskId}/stream`,
  { headers: { Authorization: `Bearer ${token}` } }
);

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  updateProgressBar(data.pct, data.stage_label, data.eta_seconds);
  if (['done', 'failed', 'cancelled'].includes(data.status)) {
    es.close();
  }
};
```

---

### `POST /api/tasks/{task_id}/cancel`

Request cancellation of a running or queued task.  
**Requires:** `tasks:cancel` permission (admin, manager)

The pipeline stops at the next checkpoint. The partial checkpoint is preserved for resume.

**Request**
```http
POST /api/tasks/a3f1c2d4e5b6a7c8d9e0f1a2b3c4d5e6/cancel HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`**
```json
{
  "status": "success",
  "message": "Cancellation requested."
}
```

---

### `DELETE /api/tasks/{task_id}`

Delete a terminal task record (done / failed / cancelled only).  
**Requires:** `tasks:cancel` permission (admin, manager)

**Request**
```http
DELETE /api/tasks/a3f1c2d4e5b6a7c8d9e0f1a2b3c4d5e6 HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`**
```json
{
  "status": "success",
  "message": "Task 'a3f1...' deleted."
}
```

**Error responses**

| Code | Condition |
|------|-----------|
| `404` | Task not found |
| `409` | Task is still running — cancel first |

---

---

## Query Routes

Base prefix: `/api`

---

### `POST /api/query`

Query the knowledge base using the full multi-agent RAG pipeline.  
**Requires:** `query:execute` permission (all roles)

**Pipeline:**  
Intent Agent → Query Rewriter → Planner Agent → Parallel Retrieval (FAISS beam search + hybrid BM25 + cross-encoder) → Synthesis Agent

**Request**
```http
POST /api/query HTTP/1.1
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | ✅ | 1–2000 chars, auto-stripped of whitespace |
| `doc_ids` | array of strings | ❌ | Scope to specific documents. Empty = search all |

```json
{
  "query": "What are the post-operative discharge criteria?",
  "doc_ids": []
}
```

**To scope to specific documents:**
```json
{
  "query": "What is the leave policy?",
  "doc_ids": ["1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"]
}
```

**Response `200 OK`**
```json
{
  "status": "success",
  "answer": "Post-operative discharge requires that the patient meets the following criteria: (→ Discharge Protocols, Section 4.2)...",
  "confidence": "HIGH",
  "intent_type": "PROCEDURE",
  "search_focus": "The criteria a patient must meet before being discharged after surgery.",
  "gaps": [],
  "sources": [
    {
      "doc_id": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
      "node_id": "0023",
      "title": "Discharge Protocols",
      "filename": "hospital-procedures.pdf"
    }
  ],
  "thinking": "[Intent Agent]\n  Type: PROCEDURE  Confidence: 92%\n  ...\n[Planner Agent]\n  Mode: multi  Top-K: 5  Reranker: true\n  Rewritten query: Post-operative patient discharge criteria and protocols\n  Query variants (3):\n    1. Steps for releasing a patient after surgery\n    2. ...\n[Retrieval Agent]\n  Sections used:\n    • Discharge Protocols\n    • Post-Operative Care",
  "elapsed_ms": 4230.0
}
```

**Confidence values**

| Value | Meaning |
|-------|---------|
| `HIGH` | Context directly and completely answers the query |
| `MEDIUM` | Partial information; some inference involved |
| `LOW` | Minimal relevant information found |

**Intent types**

| Type | Description |
|------|-------------|
| `DEFINITION` | What is X? |
| `PROCEDURE` | How do I do X? |
| `LOOKUP` | What is the value/code/name of X? |
| `COMPARISON` | Compare X vs Y |
| `SUMMARISE` | Give me an overview |
| `EXISTENCE_CHECK` | Does X exist / is X allowed? |
| `LIST` | List all X |
| `CAUSAL` | Why does X happen? |
| `CONDITIONAL` | What happens if X? |
| `PERSON_LOOKUP` | Who is responsible for X? |
| `DATE_LOOKUP` | When was X? |

**Example (Python)**
```python
import httpx

response = httpx.post(
    "http://localhost:8000/api/query",
    headers={"Authorization": f"Bearer {access_token}"},
    json={"query": "What is the annual leave policy?"}
)
result = response.json()
print(result["answer"])
print(f"Confidence: {result['confidence']}")
for source in result["sources"]:
    print(f"  [{source['title']}] in {source['filename']}")
```

---

### `GET /api/documents`

List all ingested documents.  
**Requires:** `documents:list` permission (admin, manager, analyst)

**Request**
```http
GET /api/documents HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`**
```json
{
  "status": "success",
  "total": 3,
  "documents": [
    {
      "doc_id": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
      "filename": "hospital-procedures.pdf",
      "nodes": 47
    },
    {
      "doc_id": "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e",
      "filename": "hr-policy-2024.pdf",
      "nodes": 31
    }
  ]
}
```

---

### `GET /api/cache/stats`

View query cache statistics.  
**Requires:** `cache:view` permission (admin, manager, analyst)

**Request**
```http
GET /api/cache/stats HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`**
```json
{
  "status": "success",
  "entries": 42,
  "max_entries": 1000,
  "ttl_seconds": 604800,
  "enabled": true
}
```

---

### `DELETE /api/cache`

Clear the query cache and in-memory index cache.  
**Requires:** `cache:manage` permission (admin, manager)

**Request**
```http
DELETE /api/cache HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`**
```json
{
  "status": "success",
  "message": "Query cache and index cache cleared."
}
```

---

---

## Citation Routes

Base prefix: `/api/cite`  
**Requires:** `citations:view` permission (all roles)

---

### `GET /api/cite/{doc_id}`

Stream a stored PDF for inline browser rendering. Use `doc_id` values returned by `/api/query` sources or `/api/documents`.

**Path parameters**

| Param | Type | Constraints |
|-------|------|-------------|
| `doc_id` | string | Exactly 32 lowercase hex characters |

**Request**
```http
GET /api/cite/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`**
- Content-Type: `application/pdf`
- Content-Disposition: `inline`
- Body: Raw PDF bytes

**Frontend usage — embed in iframe**
```html
<iframe
  src="/api/cite/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d#page=4"
  width="100%"
  height="600px"
></iframe>
```
> The `#page=N` fragment is handled client-side by the browser's PDF viewer. N is 1-indexed.

**Frontend usage — PDF.js**
```javascript
// Load PDF from citation endpoint
const pdfUrl = `/api/cite/${docId}`;
const loadingTask = pdfjsLib.getDocument({
  url: pdfUrl,
  httpHeaders: { Authorization: `Bearer ${token}` }
});
const pdf = await loadingTask.promise;
```

**Error responses**

| Code | Condition |
|------|-----------|
| `400` | `doc_id` is not a valid 32-char lowercase hex string |
| `404` | Document not found on disk |

---

---

## Admin Routes

Base prefix: `/admin`  
**Requires:** `admin:users` permission (admin only) unless noted

---

### `GET /admin/users`

List all user accounts.

**Request**
```http
GET /admin/users HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`**
```json
{
  "status": "success",
  "total": 3,
  "users": [
    {
      "user_id": "15fa24cc295947929a97f35bf2a26eec",
      "username": "admin",
      "email": "admin@local",
      "full_name": "System Administrator",
      "role": "admin",
      "permissions": ["admin:roles", "admin:users", "..."],
      "is_active": true,
      "created_at": 1777013604.4,
      "created_by": "system",
      "updated_at": 1777013604.4,
      "last_login": null,
      "login_count": 0
    }
  ]
}
```

---

### `POST /admin/users`

Create a new user account.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `username` | string | ✅ | 3–40 chars, alphanumeric + `.`, `_`, `-` |
| `email` | string | ✅ | 5–120 chars |
| `full_name` | string | ✅ | 1–120 chars |
| `role` | string | ✅ | One of: `admin`, `manager`, `analyst`, `viewer` |
| `password` | string | ✅ | 8–128 chars, must meet password policy |

```json
{
  "username": "jane.smith",
  "email": "jane@example.com",
  "full_name": "Jane Smith",
  "role": "analyst",
  "password": "SecureP@ss1!"
}
```

**Response `201 Created`** — full `UserResponse` object

**Error responses**

| Code | Condition |
|------|-----------|
| `400` | Password policy violation |
| `409` | Username or email already taken |

---

### `GET /admin/users/{user_id}`

Get a specific user.

**Response `200 OK`** — `UserResponse` object

**Error responses**

| Code | Condition |
|------|-----------|
| `404` | User not found |

---

### `PATCH /admin/users/{user_id}`

Update a user's profile, role, or active status.

**Request body** (all fields optional)

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | New email |
| `full_name` | string | New display name |
| `role` | string | New role |
| `is_active` | boolean | Activate / deactivate account |

```json
{
  "role": "manager",
  "is_active": true
}
```

**Response `200 OK`** — updated `UserResponse` object

**Error responses**

| Code | Condition |
|------|-----------|
| `400` | Invalid role, or admin trying to demote themselves |
| `404` | User not found |

---

### `DELETE /admin/users/{user_id}`

Permanently delete a user account.

**Error responses**

| Code | Condition |
|------|-----------|
| `400` | Admin trying to delete their own account |
| `404` | User not found |

**Response `200 OK`**
```json
{
  "status": "success",
  "message": "User 'jane.smith' has been deleted."
}
```

---

### `POST /admin/users/{user_id}/reset-password`

Force-reset a user's password to a random temporary value. The temporary password is shown **once** in the response — store it immediately.

**Response `200 OK`**
```json
{
  "status": "success",
  "temporary_password": "xK3mR7pQ2nLs9T",
  "message": "Password for 'jane.smith' has been reset. Provide the temporary password to the user — it is shown only once."
}
```

---

### `GET /admin/audit`

View the audit log.  
**Requires:** `admin:view_audit` permission (admin only)

**Query parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | `100` | Max entries to return |
| `user_id` | string | — | Filter by specific user ID |

**Request**
```http
GET /admin/audit?limit=50&user_id=15fa24cc295947929a97f35bf2a26eec HTTP/1.1
Authorization: Bearer <access_token>
```

**Response `200 OK`**
```json
{
  "status": "success",
  "total": 2,
  "entries": [
    {
      "ts": 1712345678.0,
      "user_id": "15fa24cc295947929a97f35bf2a26eec",
      "action": "auth.login",
      "detail": "User 'admin' logged in"
    },
    {
      "ts": 1712345690.0,
      "user_id": "15fa24cc295947929a97f35bf2a26eec",
      "action": "ingest.create",
      "detail": "Uploaded 'report.pdf' → task a3f1..."
    }
  ]
}
```

**Audit action types**

| Action | Trigger |
|--------|---------|
| `auth.login` | Successful login |
| `auth.login_failed` | Failed login attempt |
| `auth.logout` | Logout |
| `auth.token_refresh` | Token refresh |
| `user.create` | New user created |
| `user.update` | User updated |
| `user.delete` | User deleted |
| `user.password_change` | Password changed |
| `ingest.create` | Document uploaded |
| `query.execute` | Query run |
| `task.cancel` | Task cancelled |
| `cache.clear` | Cache cleared |
| `admin.user_create` | Admin created user |
| `admin.user_update` | Admin updated user |
| `admin.user_delete` | Admin deleted user |
| `admin.password_reset` | Admin reset password |

---

### `GET /admin/roles`

Full role-permission matrix.  
**Requires:** `admin:users` permission.

**Response `200 OK`**
```json
{
  "status": "success",
  "roles": ["admin", "manager", "analyst", "viewer"],
  "permissions": {
    "admin": ["admin:roles", "admin:users", "..."],
    "manager": ["cache:manage", "documents:delete", "..."]
  }
}
```

---

---

## Data Models Reference

### `TaskStatusResponse`

```typescript
{
  task_id:         string       // 32-char hex
  doc_id:          string       // 32-char hex
  filename:        string       // original uploaded filename
  status:          "queued" | "running" | "done" | "failed" | "cancelled" | "interrupted"
  stage:           string       // last completed pipeline stage
  stage_label:     string       // human-readable stage label
  pct:             number       // 0.0–100.0
  total_nodes:     number       // total tree nodes to process
  nodes_done:      number       // nodes summarised so far
  eta_seconds:     number|null  // estimated seconds remaining
  current_node:    string|null  // node title currently being processed
  elapsed_seconds: number       // wall-clock seconds elapsed
  error:           string|null  // error message if status=failed
  created_at:      number       // Unix timestamp
  started_at:      number|null  // Unix timestamp
  completed_at:    number|null  // Unix timestamp
}
```

### `QueryResponse`

```typescript
{
  status:       string           // "success"
  answer:       string           // main answer text
  confidence:   "HIGH" | "MEDIUM" | "LOW"
  intent_type:  string           // classified intent
  search_focus: string           // what the agents searched for
  gaps:         string[]         // topics not found in documents
  sources:      SourceCitation[]
  thinking:     string           // full agent reasoning trace
  elapsed_ms:   number           // total pipeline time in ms
}
```

### `SourceCitation`

```typescript
{
  doc_id:   string   // 32-char hex — use in /api/cite/{doc_id}
  node_id:  string   // 4-char zero-padded node ID within the document
  title:    string   // section title
  filename: string   // original PDF filename
}
```

---

---

## Error Codes Reference

| HTTP Code | Meaning | Common Causes |
|-----------|---------|---------------|
| `400` | Bad Request | Invalid doc_id format, wrong file extension, password policy failure |
| `401` | Unauthorized | Missing/expired/revoked token, wrong credentials |
| `403` | Forbidden | Role lacks required permission |
| `404` | Not Found | Task/document/user doesn't exist |
| `409` | Conflict | Username taken, deleting active task |
| `413` | Payload Too Large | File exceeds 50 MB |
| `415` | Unsupported Media Type | Not a PDF |
| `500` | Internal Server Error | Pipeline failure, LLM unreachable, disk write failure |

All error responses follow this shape:
```json
{
  "detail": "Human-readable error message."
}
```

---

---

## Quick Start Examples

### Full workflow: upload → poll → query

```python
import httpx
import time

BASE = "http://localhost:8000"

# 1. Login
r = httpx.post(f"{BASE}/auth/login", json={"username": "admin", "password": "YourP@ss1!"})
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# 2. Upload PDF
with open("report.pdf", "rb") as f:
    r = httpx.post(f"{BASE}/api/ingest", headers=headers,
                   files={"file": ("report.pdf", f, "application/pdf")})
task_id = r.json()["task_id"]
print(f"Task started: {task_id}")

# 3. Poll until done
while True:
    r = httpx.get(f"{BASE}/api/tasks/{task_id}", headers=headers)
    task = r.json()
    print(f"[{task['pct']:.0f}%] {task['stage_label']}")
    if task["status"] in ("done", "failed", "cancelled"):
        break
    time.sleep(2)

# 4. Query
r = httpx.post(f"{BASE}/api/query", headers=headers,
               json={"query": "What are the key findings?"})
result = r.json()
print(f"\nAnswer ({result['confidence']}): {result['answer']}")
for src in result["sources"]:
    print(f"  Source: [{src['title']}] in {src['filename']}")
    print(f"  View: {BASE}/api/cite/{src['doc_id']}#page=1")
```

### SSE progress stream (JavaScript)

```javascript
async function ingestAndTrack(file, token) {
  // Upload
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/ingest', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const { task_id } = await res.json();

  // Stream progress
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/tasks/${task_id}/stream`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      console.log(`${data.pct.toFixed(1)}% — ${data.stage_label}`);
      if (data.status === 'done') { es.close(); resolve(data); }
      if (data.status === 'failed') { es.close(); reject(data.error); }
    };
  });
}
```

### Create a new analyst user (admin only)

```bash
curl -X POST http://localhost:8000/admin/users \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "new.analyst",
    "email": "analyst@company.com",
    "full_name": "New Analyst",
    "role": "analyst",
    "password": "SecureP@ss1!"
  }'
```

---

*Generated for Contexta Enterprise v4.0.0*