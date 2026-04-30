// components/query/DocumentsView.tsx
"use client"

import { useEffect, useState } from "react"
import {
    FileText, RefreshCw, Trash2, Database,
    BarChart2, Clock, Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useQuery } from "@/lib/hooks"
import { usePermission } from "@/lib/hooks"
import { useToast } from "@/components/ui/use-toast"
import { formatBytes } from "@/utils"
import { cn } from "@/utils/cn"

export function DocumentsView() {
    const { toast } = useToast()
    const {
        documents, documentsStatus, cacheStats,
        refreshDocuments, loadCacheStats, clearCache,
    } = useQuery()
    const { canManageCache, canViewCache } = usePermission()
    const [clearConfirm, setClearConfirm] = useState(false)

    useEffect(() => {
        refreshDocuments()
        if (canViewCache) loadCacheStats()
    }, []) // eslint-disable-line

    const handleClearCache = async () => {
        await clearCache()
        toast({ title: "Cache cleared", description: "Query cache has been reset." })
        setClearConfirm(false)
    }

    const isLoading = documentsStatus === "loading"
    const totalNodes = documents.reduce((acc, d) => acc + d.nodes, 0)

    return (
        <div className="space-y-8">
            <PageHeader
                title="Documents"
                description="All ingested PDF documents available for querying."
                action={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refreshDocuments}
                        disabled={isLoading}
                    >
                        <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isLoading && "animate-spin")} />
                        Refresh
                    </Button>
                }
            />

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard icon={FileText} label="Documents" value={String(documents.length)} />
                <StatCard icon={Database} label="Total nodes" value={String(totalNodes)} />
                {canViewCache && cacheStats && (
                    <StatCard
                        icon={Zap}
                        label="Cache entries"
                        value={`${cacheStats.entries} / ${cacheStats.max_entries}`}
                    />
                )}
            </div>

            {/* Document list */}
            <div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Ingested files
                </h2>

                {isLoading && documents.length === 0 ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                    </div>
                ) : documents.length === 0 ? (
                    <EmptyState
                        icon={FileText}
                        title="No documents yet"
                        description="Upload PDFs from the Upload page to start building your knowledge base."
                    />
                ) : (
                    <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                        {documents.map((doc, idx) => (
                            <div
                                key={doc.doc_id}
                                className="flex items-center gap-3 bg-card px-4 py-3 hover:bg-accent/40 transition-colors"
                            >
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--brand-muted))]">
                                    <FileText className="h-4 w-4 text-[hsl(var(--brand))]" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{doc.filename}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {doc.nodes} sections indexed
                                    </p>
                                </div>
                                <Badge variant="outline" className="shrink-0 text-[11px]">
                                    {doc.doc_id.slice(0, 8)}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Cache management */}
            {canViewCache && cacheStats && (
                <>
                    <Separator />
                    <div>
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Query cache
                        </h2>
                        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">Entries</p>
                                    <p className="font-medium">{cacheStats.entries}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Max entries</p>
                                    <p className="font-medium">{cacheStats.max_entries.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">TTL</p>
                                    <p className="font-medium">
                                        {Math.round(cacheStats.ttl_seconds / 86400)} days
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Status</p>
                                    <Badge
                                        variant={cacheStats.enabled ? "default" : "secondary"}
                                        className="text-[11px]"
                                    >
                                        {cacheStats.enabled ? "Enabled" : "Disabled"}
                                    </Badge>
                                </div>
                            </div>

                            {canManageCache && (
                                <div className="flex justify-end">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-destructive border-destructive/40 hover:bg-destructive/5"
                                        onClick={() => setClearConfirm(true)}
                                    >
                                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                                        Clear cache
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            <ConfirmDialog
                open={clearConfirm}
                onOpenChange={setClearConfirm}
                title="Clear query cache?"
                description="This will remove all cached query results. Subsequent queries will re-run the full pipeline until the cache is rebuilt."
                confirmLabel="Clear cache"
                variant="destructive"
                onConfirm={handleClearCache}
            />
        </div>
    )
}

function StatCard({
    icon: Icon, label, value,
}: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs">{label}</span>
            </div>
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
    )
}