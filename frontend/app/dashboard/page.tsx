import type { Metadata } from "next"
import { AppShell } from "@/components/layout/AppShell"
import { QueryInterface } from "@/components/query/QueryInterface"

export const metadata: Metadata = {
    title: "Ask Contexta | AI Knowledge Base",
    description: "Secure, local retrieval-augmented generation for your institutional data."
}

export default function DashboardPage() {
    return (
        <AppShell requiredPermission="query:execute">
            <QueryInterface />
        </AppShell>
    )
}