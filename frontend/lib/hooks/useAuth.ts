// ============================================================
// lib/hooks/useAuth.ts
// Auth state + actions hook.
// ============================================================

"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import {
    login,
    logout,
    fetchProfile,
    sessionExpired,
    clearError,
    selectUser,
    selectProfile,
    selectIsAuthenticated,
    selectAuthStatus,
    selectAuthError,
    selectRole,
    selectPermissions,
    selectHasPermission,
} from "@/store/slices/authSlice"
import type { LoginRequest, Permission } from "@/types"

export function useAuth() {
    const dispatch = useAppDispatch()
    const router = useRouter()

    const user = useAppSelector(selectUser)
    const profile = useAppSelector(selectProfile)
    const isAuthenticated = useAppSelector(selectIsAuthenticated)
    const status = useAppSelector(selectAuthStatus)
    const error = useAppSelector(selectAuthError)
    const role = useAppSelector(selectRole)
    const permissions = useAppSelector(selectPermissions)

    // Listen for global session-expired event fired by the API client
    useEffect(() => {
        const handler = () => {
            dispatch(sessionExpired())
            router.push("/login")
        }
        window.addEventListener("contexta:session-expired", handler)
        return () => window.removeEventListener("contexta:session-expired", handler)
    }, [dispatch, router])

    const handleLogin = async (credentials: LoginRequest) => {
        const result = await dispatch(login(credentials))
        if (login.fulfilled.match(result)) {
            router.push("/dashboard")
        }
    }

    const handleLogout = async () => {
        await dispatch(logout())
        router.push("/login")
    }

    const loadProfile = () => dispatch(fetchProfile())

    const hasPermission = (permission: Permission): boolean =>
        permissions.includes(permission)

    const hasAnyPermission = (...perms: Permission[]): boolean =>
        perms.some((p) => permissions.includes(p))

    return {
        // State
        user,
        profile,
        isAuthenticated,
        status,
        error,
        role,
        permissions,
        isLoading: status === "loading",

        // Actions
        login: handleLogin,
        logout: handleLogout,
        loadProfile,
        clearError: () => dispatch(clearError()),

        // Permission helpers
        hasPermission,
        hasAnyPermission,
        can: hasPermission,
    }
}