// ============================================================
// store/slices/authSlice.ts
// Auth state: current user, login/logout async thunks.
// ============================================================

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit"

import { authService } from "@/services"
import type { LoginRequest, UserProfile, TokenResponse, Role, Permission } from "@/types"

// ── State ─────────────────────────────────────────────────────

interface AuthState {
    user: {
        user_id: string
        username: string
        role: Role
        permissions: Permission[]
    } | null
    profile: UserProfile | null
    status: "idle" | "loading" | "succeeded" | "failed"
    error: string | null
    isAuthenticated: boolean
}

const cachedUser = authService.getCachedUser()

const initialState: AuthState = {
    user: cachedUser,
    profile: null,
    status: "idle",
    error: null,
    isAuthenticated: authService.isAuthenticated(),
}

// ── Thunks ────────────────────────────────────────────────────

export const login = createAsyncThunk<TokenResponse, LoginRequest>(
    "auth/login",
    async (credentials, { rejectWithValue }) => {
        try {
            return await authService.login(credentials)
        } catch (err: any) {
            return rejectWithValue(err.detail ?? "Login failed")
        }
    },
)

export const logout = createAsyncThunk<void, void>(
    "auth/logout",
    async (_, { rejectWithValue }) => {
        try {
            await authService.logout()
        } catch (err: any) {
            // Even if server logout fails, clear local state
            return rejectWithValue(err.detail ?? "Logout failed")
        }
    },
)

export const fetchProfile = createAsyncThunk<UserProfile, void>(
    "auth/fetchProfile",
    async (_, { rejectWithValue }) => {
        try {
            return await authService.getMe()
        } catch (err: any) {
            return rejectWithValue(err.detail ?? "Failed to load profile")
        }
    },
)

// ── Slice ─────────────────────────────────────────────────────

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        /** Called when the session-expired event fires (token refresh failed) */
        sessionExpired(state) {
            state.user = null
            state.profile = null
            state.isAuthenticated = false
            state.error = "Your session has expired. Please log in again."
        },
        clearError(state) {
            state.error = null
        },
    },
    extraReducers: (builder) => {
        // ── login ──────────────────────────────────────────────
        builder
            .addCase(login.pending, (state) => {
                state.status = "loading"
                state.error = null
            })
            .addCase(login.fulfilled, (state, action) => {
                state.status = "succeeded"
                state.isAuthenticated = true
                state.user = {
                    user_id: action.payload.user_id,
                    username: action.payload.username,
                    role: action.payload.role,
                    permissions: action.payload.permissions,
                }
                state.error = null
            })
            .addCase(login.rejected, (state, action) => {
                state.status = "failed"
                state.error = action.payload as string
                state.isAuthenticated = false
            })

        // ── logout ─────────────────────────────────────────────
        builder
            .addCase(logout.fulfilled, (state) => {
                state.user = null
                state.profile = null
                state.isAuthenticated = false
                state.status = "idle"
                state.error = null
            })
            .addCase(logout.rejected, (state) => {
                // Clear anyway — server rejection doesn't stop local logout
                state.user = null
                state.profile = null
                state.isAuthenticated = false
                state.status = "idle"
            })

        // ── fetchProfile ───────────────────────────────────────
        builder
            .addCase(fetchProfile.fulfilled, (state, action) => {
                state.profile = action.payload
            })
    },
})

export const { sessionExpired, clearError } = authSlice.actions
export default authSlice.reducer

// ── Selectors ─────────────────────────────────────────────────

import type { RootState } from "@/store/store"

export const selectUser = (s: RootState) => s.auth.user
export const selectProfile = (s: RootState) => s.auth.profile
export const selectIsAuthenticated = (s: RootState) => s.auth.isAuthenticated
export const selectAuthStatus = (s: RootState) => s.auth.status
export const selectAuthError = (s: RootState) => s.auth.error
export const selectRole = (s: RootState) => s.auth.user?.role ?? null
export const selectPermissions = (s: RootState) => s.auth.user?.permissions ?? []

/** Returns true if the current user has the given permission */
export const selectHasPermission =
    (permission: Permission) => (s: RootState): boolean =>
        s.auth.user?.permissions.includes(permission) ?? false