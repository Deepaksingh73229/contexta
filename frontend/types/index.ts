// ============================================================
// types/index.ts
// Single source of truth for all API types.
// Mirrors the Pydantic schemas in server/models/schemas.py exactly.
// ============================================================

// ── Auth ─────────────────────────────────────────────────────

export interface LoginRequest {
    username: string
    password: string
}

export interface TokenResponse {
    access_token: string
    refresh_token: string
    token_type: "bearer"
    expires_in: number // seconds
    user_id: string
    username: string
    role: Role
    permissions: Permission[]
}

export interface UserProfile {
    user_id: string
    username: string
    email: string
    full_name: string
    role: Role
    permissions: Permission[]
    is_active: boolean
    last_login: number | null
    login_count: number
}

export interface RefreshRequest {
    refresh_token: string
}

export interface ChangePasswordRequest {
    current_password: string
    new_password: string
}

// ── RBAC ─────────────────────────────────────────────────────

export type Role = "admin" | "manager" | "analyst" | "viewer"

export type Permission =
    | "ingest:create"
    | "ingest:view_progress"
    | "documents:list"
    | "documents:delete"
    | "query:execute"
    | "citations:view"
    | "tasks:cancel"
    | "tasks:view_all"
    | "cache:view"
    | "cache:manage"
    | "admin:users"
    | "admin:roles"
    | "admin:view_audit"

export interface RolesResponse {
    roles: Role[]
    permissions: Record<Role, Permission[]>
}

// ── Ingestion ─────────────────────────────────────────────────

export interface TaskAcceptedResponse {
    status: "accepted"
    task_id: string
    doc_id: string
    filename: string
    message: string
}

export type TaskStatus =
    | "queued"
    | "running"
    | "done"
    | "failed"
    | "cancelled"
    | "interrupted"

export type TaskStage =
    | "queued"
    | "uploaded"
    | "markdown"
    | "building_tree"
    | "tree_built"
    | "summarising"
    | "summarised"
    | "embedding"
    | "embedded"
    | "indexing"
    | "indexed"
    | "saving"
    | "done"
    | "failed"
    | "cancelled"
    | "interrupted"

export const STAGE_LABELS: Record<TaskStage, string> = {
    queued: "Queued",
    uploaded: "File uploaded",
    markdown: "Converting PDF",
    building_tree: "Building structure",
    tree_built: "Structure ready",
    summarising: "Summarising sections",
    summarised: "Sections summarised",
    embedding: "Generating embeddings",
    embedded: "Embeddings ready",
    indexing: "Building search index",
    indexed: "Index ready",
    saving: "Saving to disk",
    done: "Complete",
    failed: "Failed",
    cancelled: "Cancelled",
    interrupted: "Interrupted — will resume",
}

export interface TaskStatusResponse {
    task_id: string
    doc_id: string
    filename: string
    status: TaskStatus
    stage: TaskStage
    stage_label: string
    pct: number
    total_nodes: number
    nodes_done: number
    eta_seconds: number | null
    current_node: string | null
    elapsed_seconds: number
    error: string | null
    created_at: number
    started_at: number | null
    completed_at: number | null
}

export interface TaskListResponse {
    status: string
    tasks: TaskStatusResponse[]
    total: number
}

// ── Query ─────────────────────────────────────────────────────

export interface QueryRequest {
    query: string
    doc_ids?: string[]
}

export type Confidence = "HIGH" | "MEDIUM" | "LOW"

export type IntentType =
    | "DEFINITION"
    | "PROCEDURE"
    | "LOOKUP"
    | "COMPARISON"
    | "SUMMARISE"
    | "EXISTENCE_CHECK"
    | "LIST"
    | "CAUSAL"
    | "CONDITIONAL"
    | "PERSON_LOOKUP"
    | "DATE_LOOKUP"

export const INTENT_LABELS: Record<IntentType, string> = {
    DEFINITION: "Definition",
    PROCEDURE: "Procedure",
    LOOKUP: "Fact lookup",
    COMPARISON: "Comparison",
    SUMMARISE: "Summary",
    EXISTENCE_CHECK: "Existence check",
    LIST: "List",
    CAUSAL: "Causal reasoning",
    CONDITIONAL: "Conditional",
    PERSON_LOOKUP: "Person lookup",
    DATE_LOOKUP: "Date lookup",
}

export interface SourceCitation {
    doc_id: string
    node_id: string
    title: string
    filename: string
}

export interface QueryResponse {
    status: string
    answer: string
    confidence: Confidence
    intent_type: IntentType
    search_focus: string
    gaps: string[]
    sources: SourceCitation[]
    thinking: string
    elapsed_ms: number
}

// ── Documents ─────────────────────────────────────────────────

export interface DocumentInfo {
    doc_id: string
    filename: string
    nodes: number
}

export interface DocumentListResponse {
    status: string
    documents: DocumentInfo[]
    total: number
}

// ── Cache ─────────────────────────────────────────────────────

export interface CacheStatsResponse {
    status: string
    entries: number
    max_entries: number
    ttl_seconds: number
    enabled: boolean
}

// ── Admin – Users ─────────────────────────────────────────────

export interface AdminUser {
    user_id: string
    username: string
    email: string
    full_name: string
    role: Role
    permissions: Permission[]
    is_active: boolean
    created_at: number
    created_by: string
    updated_at: number
    last_login: number | null
    login_count: number
}

export interface UserListResponse {
    status: string
    users: AdminUser[]
    total: number
}

export interface CreateUserRequest {
    username: string
    email: string
    full_name: string
    role: Role
    password: string
}

export interface UpdateUserRequest {
    email?: string
    full_name?: string
    role?: Role
    is_active?: boolean
}

export interface ResetPasswordResponse {
    status: string
    temporary_password: string
    message: string
}

// ── Admin – Audit ─────────────────────────────────────────────

export interface AuditEntry {
    ts: number
    user_id: string
    action: string
    detail: string
}

export interface AuditLogResponse {
    status: string
    entries: AuditEntry[]
    total: number
}

// ── API Error ─────────────────────────────────────────────────

export interface ApiError {
    detail: string
    status: number
}

// ── SSE Event ─────────────────────────────────────────────────

export interface TaskSSEEvent {
    task_id: string
    status: TaskStatus
    stage: TaskStage
    stage_label: string
    pct: number
    nodes_done: number
    total_nodes: number
    eta_seconds: number | null
    current_node: string | null
    elapsed_s: number
    error: string | null
}