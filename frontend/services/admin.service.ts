// ============================================================
// services/admin.service.ts
// Admin-only user management and audit log API calls.
// ============================================================

import { apiClient } from "@/lib/api-client"
import { ENDPOINTS } from "@/config/api.config"
import type {
    AdminUser,
    UserListResponse,
    CreateUserRequest,
    UpdateUserRequest,
    ResetPasswordResponse,
    AuditLogResponse,
    RolesResponse,
} from "@/types"

export const adminService = {
    // ── User management ───────────────────────────────────────

    /**
     * List all user accounts with roles and permissions.
     */
    listUsers: (): Promise<UserListResponse> =>
        apiClient.get<UserListResponse>(ENDPOINTS.ADMIN.USERS),

    /**
     * Get a single user by ID.
     */
    getUser: (userId: string): Promise<AdminUser> =>
        apiClient.get<AdminUser>(ENDPOINTS.ADMIN.USER(userId)),

    /**
     * Create a new user account.
     * Password must meet the policy (8+ chars, upper, lower, digit, special).
     */
    createUser: (body: CreateUserRequest): Promise<AdminUser> =>
        apiClient.post<AdminUser>(ENDPOINTS.ADMIN.USERS, body),

    /**
     * Update a user's profile, role, or active status.
     * All fields are optional.
     */
    updateUser: (userId: string, body: UpdateUserRequest): Promise<AdminUser> =>
        apiClient.patch<AdminUser>(ENDPOINTS.ADMIN.USER(userId), body),

    /**
     * Permanently delete a user account.
     * Admins cannot delete their own account.
     */
    deleteUser: (userId: string): Promise<{ status: string; message: string }> =>
        apiClient.delete(ENDPOINTS.ADMIN.USER(userId)),

    /**
     * Force-reset a user's password to a random temporary value.
     * The temporary password is shown once in the response.
     */
    resetPassword: (userId: string): Promise<ResetPasswordResponse> =>
        apiClient.post<ResetPasswordResponse>(ENDPOINTS.ADMIN.RESET_PASSWORD(userId)),

    // ── Audit log ─────────────────────────────────────────────

    /**
     * Fetch the audit log.
     * @param limit  - Max entries (default 100)
     * @param userId - Optional filter by user ID
     */
    getAuditLog: (
        limit = 100,
        userId?: string,
    ): Promise<AuditLogResponse> => {
        const params = new URLSearchParams({ limit: String(limit) })
        if (userId) params.set("user_id", userId)
        return apiClient.get<AuditLogResponse>(
            `${ENDPOINTS.ADMIN.AUDIT}?${params.toString()}`,
        )
    },

    // ── Roles ─────────────────────────────────────────────────

    /**
     * Get the full role-permission matrix (admin view).
     */
    getRoles: (): Promise<RolesResponse & { status: string }> =>
        apiClient.get(ENDPOINTS.ADMIN.ROLES),
}