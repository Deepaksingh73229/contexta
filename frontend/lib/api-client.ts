// ============================================================
// lib/api-client.ts
// Core HTTP client. Handles:
//   - Bearer token injection on every request
//   - Automatic token refresh on 401
//   - Typed error parsing
//   - Request timeouts
//   - File upload with multipart/form-data
// ============================================================

import { API_CONFIG, ENDPOINTS } from "@/config/api.config"
import type { TokenResponse } from "@/types"

// ── Token helpers (localStorage) ─────────────────────────────

export const tokenStore = {
    getAccess: (): string | null => {
        if (typeof window === "undefined") return null
        return localStorage.getItem(API_CONFIG.TOKEN_KEY)
    },
    getRefresh: (): string | null => {
        if (typeof window === "undefined") return null
        return localStorage.getItem(API_CONFIG.REFRESH_KEY)
    },
    setTokens: (access: string, refresh: string): void => {
        localStorage.setItem(API_CONFIG.TOKEN_KEY, access)
        localStorage.setItem(API_CONFIG.REFRESH_KEY, refresh)
    },
    clear: (): void => {
        localStorage.removeItem(API_CONFIG.TOKEN_KEY)
        localStorage.removeItem(API_CONFIG.REFRESH_KEY)
        localStorage.removeItem(API_CONFIG.USER_KEY)
    },
}

// ── Typed API error class ─────────────────────────────────────

export class ApiClientError extends Error {
    status: number
    detail: string

    constructor(status: number, detail: string) {
        super(detail)
        this.name = "ApiClientError"
        this.status = status
        this.detail = detail
    }
}

// ── Token refresh lock (prevent concurrent refresh races) ─────

let _refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
    if (_refreshPromise) return _refreshPromise

    _refreshPromise = (async () => {
        const refreshToken = tokenStore.getRefresh()
        if (!refreshToken) {
            tokenStore.clear()
            throw new ApiClientError(401, "Session expired. Please log in again.")
        }

        const res = await fetch(`${API_CONFIG.BASE_URL}${ENDPOINTS.AUTH.REFRESH}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
        })

        if (!res.ok) {
            tokenStore.clear()
            // Dispatch a global event so any listener (e.g. auth store) can redirect
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("contexta:session-expired"))
            }
            throw new ApiClientError(401, "Session expired. Please log in again.")
        }

        const data: TokenResponse = await res.json()
        tokenStore.setTokens(data.access_token, data.refresh_token)
        return data.access_token
    })()

    try {
        return await _refreshPromise
    } finally {
        _refreshPromise = null
    }
}

// ── Build request headers ─────────────────────────────────────

function buildHeaders(
    extra: Record<string, string> = {},
    isJson = true,
    includeAuth = true,
): Record<string, string> {
    const headers: Record<string, string> = { ...extra }
    const token = tokenStore.getAccess()
    if (includeAuth && token) headers["Authorization"] = `Bearer ${token}`
    if (isJson) headers["Content-Type"] = "application/json"
    return headers
}

// ── Parse error response ──────────────────────────────────────

function formatErrorDetail(detail: unknown, fallback: string): string {
    if (typeof detail === "string") return detail

    if (Array.isArray(detail)) {
        const messages = detail
            .map((item) => {
                if (typeof item === "string") return item
                if (item && typeof item === "object" && "msg" in item) {
                    return String((item as { msg: unknown }).msg)
                }
                return null
            })
            .filter(Boolean)

        return messages.length > 0 ? messages.join("; ") : fallback
    }

    if (detail && typeof detail === "object" && "msg" in detail) {
        return String((detail as { msg: unknown }).msg)
    }

    return fallback
}

async function parseError(res: Response): Promise<ApiClientError> {
    try {
        const body = await res.json()
        return new ApiClientError(res.status, formatErrorDetail(body.detail, res.statusText))
    } catch {
        return new ApiClientError(res.status, res.statusText)
    }
}

// ── Core fetch with timeout ───────────────────────────────────

async function fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number,
): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
        return await fetch(url, { ...options, signal: controller.signal })
    } catch (err) {
        if ((err as Error).name === "AbortError") {
            throw new ApiClientError(408, "Request timed out. Please try again.")
        }
        throw err
    } finally {
        clearTimeout(timer)
    }
}

// ── Main request function ─────────────────────────────────────

interface RequestOptions {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
    body?: unknown
    timeout?: number
    headers?: Record<string, string>
    /** Skip auth header — used only for login/refresh */
    skipAuth?: boolean
}

async function request<T>(
    endpoint: string,
    options: RequestOptions = {},
): Promise<T> {
    const {
        method = "GET",
        body,
        timeout = API_CONFIG.TIMEOUT_DEFAULT,
        headers: extraHeaders = {},
        skipAuth = false,
    } = options

    const url = `${API_CONFIG.BASE_URL}${endpoint}`
    const isJson = !(body instanceof FormData)
    const headers = buildHeaders(extraHeaders, isJson, !skipAuth)
    if (!isJson) delete headers["Content-Type"] // let browser set multipart boundary

    const init: RequestInit = {
        method,
        headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    }

    let res = await fetchWithTimeout(url, init, timeout)

    // ── Auto-refresh on 401 ───────────────────────────────────
    if (res.status === 401 && !skipAuth) {
        try {
            const newToken = await refreshAccessToken()
            headers["Authorization"] = `Bearer ${newToken}`
            res = await fetchWithTimeout(url, { ...init, headers }, timeout)
        } catch {
            throw new ApiClientError(401, "Session expired. Please log in again.")
        }
    }

    if (!res.ok) throw await parseError(res)

    // Handle empty body (204 No Content or DELETE responses)
    const contentType = res.headers.get("content-type") ?? ""
    if (!contentType.includes("application/json") || res.status === 204) {
        return undefined as T
    }

    return res.json() as Promise<T>
}

// ── Public API client ─────────────────────────────────────────

export const apiClient = {
    get: <T>(endpoint: string, opts?: Omit<RequestOptions, "method" | "body">) =>
        request<T>(endpoint, { ...opts, method: "GET" }),

    post: <T>(endpoint: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
        request<T>(endpoint, { ...opts, method: "POST", body }),

    patch: <T>(endpoint: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
        request<T>(endpoint, { ...opts, method: "PATCH", body }),

    delete: <T>(endpoint: string, opts?: Omit<RequestOptions, "method" | "body">) =>
        request<T>(endpoint, { ...opts, method: "DELETE" }),

    upload: <T>(endpoint: string, formData: FormData, opts?: Omit<RequestOptions, "method" | "body">) =>
        request<T>(endpoint, {
            ...opts,
            method: "POST",
            body: formData,
            timeout: API_CONFIG.TIMEOUT_UPLOAD,
        }),

    /** Build a full URL for direct navigation (e.g. PDF citation iframe src) */
    url: (endpoint: string) => `${API_CONFIG.BASE_URL}${endpoint}`,

    /** Build an authenticated URL by appending token as query param.
     *  Use only for iframe/embed scenarios where headers can't be set. */
    urlWithToken: (endpoint: string) => {
        const token = tokenStore.getAccess()
        const base = `${API_CONFIG.BASE_URL}${endpoint}`
        return token ? `${base}?token=${token}` : base
    },
}
