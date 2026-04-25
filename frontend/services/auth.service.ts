// ============================================================
// services/auth.service.ts
// All authentication API calls.
// ============================================================

import { apiClient, tokenStore } from "@/lib/api-client"
import { ENDPOINTS } from "@/config/api.config"
import type {
    LoginRequest,
    TokenResponse,
    UserProfile,
    ChangePasswordRequest,
    RolesResponse,
} from "@/types"

export const authService = {
    /**
     * Login with username + password.
     * Stores tokens automatically on success.
     */
    login: async (credentials: LoginRequest): Promise<TokenResponse> => {
        const data = await apiClient.post<TokenResponse>(
            ENDPOINTS.AUTH.LOGIN,
            credentials,
            { skipAuth: true },
        )
        tokenStore.setTokens(data.access_token, data.refresh_token)
        // Persist user profile for quick access without an extra request
        if (typeof window !== "undefined") {
            localStorage.setItem(
                "contexta_user",
                JSON.stringify({
                    user_id: data.user_id,
                    username: data.username,
                    role: data.role,
                    permissions: data.permissions,
                }),
            )
        }
        return data
    },

    /**
     * Logout — revokes the current access token on the server,
     * then clears all local storage.
     */
    logout: async (): Promise<void> => {
        try {
            await apiClient.post(ENDPOINTS.AUTH.LOGOUT)
        } finally {
            tokenStore.clear()
        }
    },

    /**
     * Get the authenticated user's full profile.
     */
    getMe: (): Promise<UserProfile> =>
        apiClient.get<UserProfile>(ENDPOINTS.AUTH.ME),

    /**
     * Change the authenticated user's own password.
     */
    changePassword: (body: ChangePasswordRequest): Promise<{ status: string; message: string }> =>
        apiClient.post(ENDPOINTS.AUTH.CHANGE_PASSWORD, body),

    /**
     * Get all roles and their permissions (public — no auth needed).
     */
    getRoles: (): Promise<RolesResponse> =>
        apiClient.get<RolesResponse>(ENDPOINTS.AUTH.ROLES, { skipAuth: true }),

    /**
     * Read cached user data from localStorage without a network call.
     * Returns null if not logged in or data is stale.
     */
    getCachedUser: (): Pick<TokenResponse, "user_id" | "username" | "role" | "permissions"> | null => {
        if (typeof window === "undefined") return null
        try {
            const raw = localStorage.getItem("contexta_user")
            return raw ? JSON.parse(raw) : null
        } catch {
            return null
        }
    },

    /**
     * Check if the user is currently logged in (has an access token).
     */
    isAuthenticated: (): boolean => !!tokenStore.getAccess(),
}