import type { Metadata } from "next"
import { AppShell } from "@/components/layout/AppShell"
import { UploadZone } from "@/components/upload/UploadZone"
import { TaskList } from "@/components/tasks/TaskList"

export const metadata: Metadata = { title: "Upload Documents" }

export default function UploadPage() {
    return (
        <AppShell requiredPermission="ingest:create">
            <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Upload Documents</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Upload PDF files to ingest them into the knowledge base. Processing happens in the background.
                    </p>
                </div>

                <UploadZone />

                <div>
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        Ingestion Tasks
                    </h2>
                    <TaskList />
                </div>
            </div>
        </AppShell>
    )
}