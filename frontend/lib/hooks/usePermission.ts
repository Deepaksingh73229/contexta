// ============================================================
// lib/hooks/usePermission.ts
// Fine-grained RBAC checks in components — reads from auth store.
// ============================================================

"use client"

import { useAppSelector } from "@/store/hooks"
import { selectPermissions, selectRole } from "@/store/slices/authSlice"
import type { Permission, Role } from "@/types"
import { roleAtLeast } from "@/utils"

/**
 * Returns helpers for permission and role checks.
 *
 * @example
 * const { can, isAdmin } = usePermission()
 * if (can("ingest:create")) show upload button
 * if (isAdmin) show admin panel
 */
export function usePermission() {
    const permissions = useAppSelector(selectPermissions)
    const role = useAppSelector(selectRole)

    const can = (permission: Permission): boolean =>
        permissions.includes(permission)

    const canAny = (...perms: Permission[]): boolean =>
        perms.some((p) => permissions.includes(p))

    const canAll = (...perms: Permission[]): boolean =>
        perms.every((p) => permissions.includes(p))

    const isRole = (r: Role): boolean => role === r

    const isAtLeast = (r: Role): boolean =>
        role ? roleAtLeast(role, r) : false

    return {
        permissions,
        role,
        can,
        canAny,
        canAll,
        isRole,
        isAtLeast,

        // Shorthand role checks
        isAdmin: role === "admin",
        isManager: role === "manager" || role === "admin",
        isAnalyst: role === "analyst" || role === "manager" || role === "admin",
        isViewer: !!role,

        // Common permission checks used across the UI
        canUpload: can("ingest:create"),
        canViewProgress: can("ingest:view_progress"),
        canQuery: can("query:execute"),
        canViewDocs: can("documents:list"),
        canDeleteDocs: can("documents:delete"),
        canViewCitations: can("citations:view"),
        canCancelTasks: can("tasks:cancel"),
        canViewCache: can("cache:view"),
        canManageCache: can("cache:manage"),
        canManageUsers: can("admin:users"),
        canViewAudit: can("admin:view_audit"),
    }
}