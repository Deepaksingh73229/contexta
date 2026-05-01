import type { Metadata } from "next"
import { AppShell } from "@/components/layout/AppShell"
import { AuditView } from "@/components/admin/AuditView"

export const metadata: Metadata = { title: "Audit Log" }

export default function AuditPage() {
    return (
        <AppShell requiredPermission="admin:view_audit">
            <div className="mx-auto max-w-5xl px-4 py-8">
                <AuditView />
            </div>
        </AppShell>
    )
}