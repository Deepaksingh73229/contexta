// ============================================================
// lib/providers/AuthGuard.tsx
// Redirects unauthenticated users to /login.
// Redirects authenticated users away from /login.
// Enforces permission-based route access.
// ============================================================

"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAppSelector } from "@/store/hooks"
import { selectAuthHasHydrated, selectIsAuthenticated, selectPermissions } from "@/store/slices/authSlice"
import type { Permission } from "@/types"

const PUBLIC_PATHS = ["/login", "/auth/roles"]

interface AuthGuardProps {
    children: React.ReactNode
    /** If set, user must have this permission or will be redirected to /dashboard */
    requiredPermission?: Permission
}

export function AuthGuard({ children, requiredPermission }: AuthGuardProps) {
    const router = useRouter()
    const pathname = usePathname()
    const isAuth = useAppSelector(selectIsAuthenticated)
    const hasHydrated = useAppSelector(selectAuthHasHydrated)
    const permissions = useAppSelector(selectPermissions)

    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

    useEffect(() => {
        if (!hasHydrated) return

        if (!isPublic && !isAuth) {
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
            return
        }
        if (isPublic && isAuth) {
            router.replace("/dashboard")
            return
        }
        if (requiredPermission && isAuth && !permissions.includes(requiredPermission)) {
            router.replace("/dashboard")
        }
    }, [hasHydrated, isAuth, isPublic, pathname, permissions, requiredPermission, router])

    // Don't flash protected content while redirecting
    if (!isPublic && !hasHydrated) return null
    if (!isPublic && !isAuth) return null
    if (isPublic && isAuth) return null
    if (requiredPermission && isAuth && !permissions.includes(requiredPermission)) return null

    return <>{children}</>
}
