import type { Metadata } from "next"
import { AppShell } from "@/components/layout/AppShell"
import { UploadZone } from "@/components/upload/UploadZone"
import { TaskList } from "@/components/tasks/TaskList"

export const metadata: Metadata = { title: "Upload Documents" }

export default function UploadPage() {
    return (
        <AppShell requiredPermission="ingest:create">
            <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
                <div className="flex flex-col gap-3">
                    <p className="text-5xl font-black tracking-tight text-violet-500/80">
                        Upload Documents
                    </p>

                    <p className="text-sm text-muted-foreground">
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