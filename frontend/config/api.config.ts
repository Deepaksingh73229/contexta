// ============================================================
// config/api.config.ts
// Central configuration for all API endpoints and constants.
// Values are dynamically loaded from environment variables.
// ============================================================

// Helper to parse numbers from env, falling back to a default
const getEnvNumber = (key: string | undefined, fallback: number): number => {
    if (!key) return fallback;
    const parsed = parseInt(key, 10);
    return isNaN(parsed) ? fallback : parsed;
};

export const API_CONFIG = {
    // Base URL for the backend API
    BASE_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",

    // Token storage keys (localStorage/sessionStorage)
    TOKEN_KEY: process.env.NEXT_PUBLIC_TOKEN_KEY || "contexta_access_token",
    REFRESH_KEY: process.env.NEXT_PUBLIC_REFRESH_KEY || "contexta_refresh_token",
    USER_KEY: process.env.NEXT_PUBLIC_USER_KEY || "contexta_user",

    // Request timeouts (ms)
    TIMEOUT_DEFAULT: getEnvNumber(process.env.NEXT_PUBLIC_TIMEOUT_DEFAULT, 30_000),
    TIMEOUT_UPLOAD: getEnvNumber(process.env.NEXT_PUBLIC_TIMEOUT_UPLOAD, 120_000),
    TIMEOUT_QUERY: getEnvNumber(process.env.NEXT_PUBLIC_TIMEOUT_QUERY, 60_000),

    // Polling interval for task progress (ms)
    POLL_INTERVAL: getEnvNumber(process.env.NEXT_PUBLIC_POLL_INTERVAL, 2_000),
} as const;

// ── All endpoint paths ────────────────────────────────────────
export const ENDPOINTS = {
    // Health
    HEALTH: "/",

    // Auth
    AUTH: {
        LOGIN: "/auth/login",
        LOGOUT: "/auth/logout",
        REFRESH: "/auth/refresh",
        ME: "/auth/me",
        CHANGE_PASSWORD: "/auth/me/change-password",
        ROLES: "/auth/roles",
    },

    // Ingestion
    INGEST: {
        UPLOAD: "/api/ingest",
        HEALTH: "/api/ingest/health",
    },

    // Tasks
    TASKS: {
        LIST: "/api/tasks",
        GET: (taskId: string) => `/api/tasks/${taskId}`,
        STREAM: (taskId: string) => `/api/tasks/${taskId}/stream`,
        CANCEL: (taskId: string) => `/api/tasks/${taskId}/cancel`,
        DELETE: (taskId: string) => `/api/tasks/${taskId}`,
    },

    // Query
    QUERY: {
        SEARCH: "/api/query",
        DOCUMENTS: "/api/documents",
        CACHE_STATS: "/api/cache/stats",
        CACHE_CLEAR: "/api/cache",
    },

    // Citations
    CITATIONS: {
        PDF: (docId: string) => `/api/cite/${docId}`,
        PDF_PAGE: (docId: string, page: number) => `/api/cite/${docId}#page=${page}`,
    },

    // Admin
    ADMIN: {
        USERS: "/admin/users",
        USER: (userId: string) => `/admin/users/${userId}`,
        RESET_PASSWORD: (userId: string) => `/admin/users/${userId}/reset-password`,
        AUDIT: "/admin/audit",
        ROLES: "/admin/roles",
    },
} as const;

// ── Terminal task statuses (stop polling) ─────────────────────
export const TERMINAL_STATUSES = new Set(["done", "failed", "cancelled"]);