import type { Metadata } from "next"
import { AppShell } from "@/components/layout/AppShell"
import { DocumentsView } from "@/components/query/DocumentsView"

export const metadata: Metadata = { title: "Documents" }

export default function DocumentsPage() {
    return (
        <AppShell requiredPermission="documents:list">
            <div className="mx-auto max-w-5xl px-4 py-8">
                <DocumentsView />
            </div>
        </AppShell>
    )
}