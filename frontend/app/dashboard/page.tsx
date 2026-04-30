// app/dashboard/page.tsx
import type { Metadata } from "next"
import { AppShell } from "@/components/layout/AppShell"
import { QueryInterface } from "@/components/query/QueryInterface"

export const metadata: Metadata = { title: "Ask Anything" }

export default function DashboardPage() {
    return (
        <AppShell requiredPermission="query:execute">
            <QueryInterface />
        </AppShell>
    )
}