// app/admin/users/page.tsx
import type { Metadata } from "next"
import { AppShell } from "@/components/layout/AppShell"
import { UsersView } from "@/components/admin/UsersView"

export const metadata: Metadata = { title: "User Management" }

export default function AdminUsersPage() {
    return (
        <AppShell requiredPermission="admin:users">
            <div className="mx-auto max-w-5xl px-4 py-8">
                <UsersView />
            </div>
        </AppShell>
    )
}