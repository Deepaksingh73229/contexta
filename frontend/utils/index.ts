// ============================================================
// utils/index.ts
// Pure utility functions — no side effects, no imports from
// services or store. Safe to use anywhere.
// ============================================================

import type { Confidence, IntentType, TaskStatus, Permission, Role } from "@/types"
import { INTENT_LABELS, STAGE_LABELS } from "@/types"

// ── Formatting ────────────────────────────────────────────────

/**
 * Format a Unix timestamp (seconds) into a readable date string.
 */
export function formatTimestamp(ts: number): string {
    return new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(ts * 1000))
}

/**
 * Format elapsed seconds into a human-readable duration.
 * e.g. 90 → "1m 30s" | 45 → "45s" | 3700 → "1h 1m"
 */
export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.round(seconds % 60)
    if (h > 0) return `${h}h ${m}m`
    return s > 0 ? `${m}m ${s}s` : `${m}m`
}

/**
 * Format an ETA in seconds to a human-readable string.
 * e.g. 324 → "~5m 24s remaining"
 */
export function formatEta(seconds: number | null): string {
    if (seconds === null) return "Estimating…"
    if (seconds <= 0) return "Almost done…"
    return `~${formatDuration(seconds)} remaining`
}

/**
 * Format a file size in bytes to a human-readable string.
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B"
    const units = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

/**
 * Format elapsed ms to a readable query time string.
 */
export function formatQueryTime(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Truncate a string to a given length with an ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str
    return `${str.slice(0, maxLength - 1)}…`
}

/**
 * Relative time string — "2 minutes ago", "just now", etc.
 */
export function timeAgo(ts: number): string {
    const seconds = Math.floor(Date.now() / 1000 - ts)
    if (seconds < 60) return "just now"
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
}

// ── RBAC helpers ──────────────────────────────────────────────

const ROLE_HIERARCHY: Record<Role, number> = {
    admin: 4,
    manager: 3,
    analyst: 2,
    viewer: 1,
}

/**
 * Returns true if role A is at least as privileged as role B.
 */
export function roleAtLeast(userRole: Role, requiredRole: Role): boolean {
    return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0)
}

/**
 * Human-readable role label.
 */
export const ROLE_LABELS: Record<Role, string> = {
    admin: "Administrator",
    manager: "Manager",
    analyst: "Analyst",
    viewer: "Viewer",
}

/**
 * Role badge color variant (for shadcn Badge component).
 */
export function roleBadgeVariant(
    role: Role,
): "default" | "secondary" | "outline" | "destructive" {
    switch (role) {
        case "admin": return "destructive"
        case "manager": return "default"
        case "analyst": return "secondary"
        case "viewer": return "outline"
    }
}

// ── Confidence helpers ────────────────────────────────────────

export const CONFIDENCE_COLORS: Record<Confidence, string> = {
    HIGH: "text-emerald-600 dark:text-emerald-400",
    MEDIUM: "text-amber-600 dark:text-amber-400",
    LOW: "text-rose-600 dark:text-rose-400",
}

export const CONFIDENCE_BG: Record<Confidence, string> = {
    HIGH: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    MEDIUM: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
    LOW: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800",
}

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
    HIGH: "High confidence",
    MEDIUM: "Medium confidence",
    LOW: "Low confidence",
}

// ── Task status helpers ───────────────────────────────────────

export const STATUS_COLORS: Record<TaskStatus, string> = {
    queued: "text-muted-foreground",
    running: "text-blue-600 dark:text-blue-400",
    done: "text-emerald-600 dark:text-emerald-400",
    failed: "text-rose-600 dark:text-rose-400",
    cancelled: "text-amber-600 dark:text-amber-400",
    interrupted: "text-orange-600 dark:text-orange-400",
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
    queued: "Queued",
    running: "Processing",
    done: "Complete",
    failed: "Failed",
    cancelled: "Cancelled",
    interrupted: "Interrupted",
}

export function isTerminalStatus(status: TaskStatus): boolean {
    return ["done", "failed", "cancelled"].includes(status)
}

// ── Intent helpers ────────────────────────────────────────────

export { INTENT_LABELS }

export const INTENT_ICONS: Record<IntentType, string> = {
    DEFINITION: "📖",
    PROCEDURE: "📋",
    LOOKUP: "🔍",
    COMPARISON: "⚖️",
    SUMMARISE: "📝",
    EXISTENCE_CHECK: "✅",
    LIST: "📌",
    CAUSAL: "🔗",
    CONDITIONAL: "🔀",
    PERSON_LOOKUP: "👤",
    DATE_LOOKUP: "📅",
}

// ── File validation ───────────────────────────────────────────

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

const ALLOWED_FILE_TYPES = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
]

export function validateFile(file: File): string | null {
    // Check file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        return "Only PDF and image files (PNG, JPG, JPEG, WEBP) are supported."
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
        return `File is too large. Maximum size is ${formatBytes(MAX_FILE_SIZE)}.`
    }

    // Check empty file
    if (file.size === 0) {
        return "File is empty."
    }

    return null
}

// ── String helpers ────────────────────────────────────────────

/**
 * Highlight search terms in a string by wrapping matches in <mark>.
 * Returns an array of string segments and whether each is a match.
 */
export function highlightTerms(
    text: string,
    terms: string[],
): Array<{ text: string; highlight: boolean }> {
    if (!terms.length) return [{ text, highlight: false }]
    const pattern = new RegExp(
        `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
        "gi",
    )
    const parts = text.split(pattern)
    return parts.map((part) => ({
        text: part,
        highlight: pattern.test(part),
    }))
}

/**
 * Extract the first N words from a string.
 */
export function firstWords(text: string, n: number): string {
    return text.split(/\s+/).slice(0, n).join(" ")
}

/**
 * Slugify a string for use as a URL segment or ID.
 */
export function slugify(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
}

// ── Class merging (re-export for convenience) ─────────────────

export { cn } from "./cn"