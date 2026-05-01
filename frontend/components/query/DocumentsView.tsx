"use client"

import { useEffect, useState } from "react"
import {
    FileText, RefreshCw, Trash2, Database,
    BarChart2, Clock, Zap, Cpu, Terminal
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
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-10">

            <PageHeader
                title="Knowledge Base"
                description="Manage your ingested institutional data and vector store metrics."
                action={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refreshDocuments}
                        disabled={isLoading}
                        className="h-9 gap-2 rounded-full border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all shadow-sm"
                    >
                        <RefreshCw className={cn("size-3.5 text-neutral-500", isLoading && "animate-spin text-violet-500")} />
                        <span className="text-[13px] font-medium">Sync Data</span>
                    </Button>
                }
            />

            {/* ── Top-level Metrics ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatCard
                    icon={FileText}
                    label="Ingested Files"
                    value={String(documents.length)}
                    iconColor="text-blue-500"
                    iconBg="bg-blue-500/10"
                />
                <StatCard
                    icon={Database}
                    label="Total Vector Nodes"
                    value={String(totalNodes)}
                    iconColor="text-violet-500"
                    iconBg="bg-violet-500/10"
                />
                {canViewCache && cacheStats && (
                    <StatCard
                        icon={Zap}
                        label="Cache Utilization"
                        value={`${cacheStats.entries} / ${cacheStats.max_entries}`}
                        iconColor="text-amber-500"
                        iconBg="bg-amber-500/10"
                    />
                )}
            </div>

            {/* ── Document List ────────────────────────────────────────────────── */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Database className="size-4 text-neutral-400 dark:text-neutral-500" />
                    <h2 className="text-[13px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                        Indexed Documents
                    </h2>
                </div>

                {isLoading && documents.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-20 w-full rounded-2xl bg-neutral-200/50 dark:bg-neutral-800/50" />
                        ))}
                    </div>
                ) : documents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20">
                        <EmptyState
                            icon={FileText}
                            title="Vector store is empty"
                            description="Upload PDFs from the Upload page to start building Contexta's knowledge base."
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {documents.map((doc) => (
                            <div
                                key={doc.doc_id}
                                className="
                                    group flex items-center gap-4 p-4 rounded-2xl
                                    bg-white/60 dark:bg-neutral-900/40 backdrop-blur-sm
                                    ring-1 ring-inset ring-neutral-200/60 dark:ring-white/5
                                    hover:bg-white dark:hover:bg-neutral-800/80
                                    hover:ring-violet-200 dark:hover:ring-violet-500/30
                                    hover:shadow-md hover:shadow-neutral-200/40 dark:hover:shadow-none
                                    transition-all duration-300 ease-out
                                "
                            >
                                {/* Document Icon */}
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900 shadow-inner group-hover:from-violet-100 group-hover:to-violet-200 dark:group-hover:from-violet-900/50 dark:group-hover:to-violet-800/50 transition-colors">
                                    <FileText className="size-5 text-neutral-500 dark:text-neutral-400 group-hover:text-violet-600 dark:group-hover:text-violet-400" />
                                </div>

                                {/* Meta */}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[14px] font-semibold text-neutral-900 dark:text-neutral-100 mb-0.5">
                                        {doc.filename}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-mono tracking-wider bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                                            ID: {doc.doc_id.slice(0, 8)}
                                        </Badge>
                                        <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                                            • {doc.nodes} nodes
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Cache Management (Terminal Style) ────────────────────────────── */}
            {canViewCache && cacheStats && (
                <div className="pt-4">
                    <div className="relative overflow-hidden rounded-2xl bg-neutral-950 dark:bg-[#050505] ring-1 ring-inset ring-neutral-800 shadow-2xl">

                        {/* Fake Mac Toolbar */}
                        <div className="flex items-center gap-2 px-4 py-3 bg-neutral-900/80 border-b border-neutral-800">
                            <div className="flex gap-1.5">
                                <div className="size-2.5 rounded-full bg-red-500/80" />
                                <div className="size-2.5 rounded-full bg-amber-500/80" />
                                <div className="size-2.5 rounded-full bg-green-500/80" />
                            </div>
                            <div className="ml-2 flex items-center gap-1.5 text-neutral-500">
                                <Terminal className="size-3.5" />
                                <span className="text-[11px] font-mono uppercase tracking-widest">Query Cache Engine</span>
                            </div>
                        </div>

                        {/* Stats Readout */}
                        <div className="p-5 sm:p-6">
                            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 mb-6">
                                <TerminalStat label="Current Entries" value={cacheStats.entries} />
                                <TerminalStat label="Max Allocation" value={cacheStats.max_entries.toLocaleString()} />
                                <TerminalStat label="Time-to-Live (TTL)" value={`${Math.round(cacheStats.ttl_seconds / 86400)} days`} />
                                <div>
                                    <p className="text-[11px] font-mono text-neutral-500 mb-1.5">System Status</p>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "h-6 px-2.5 font-mono text-[11px] border-0",
                                            cacheStats.enabled
                                                ? "bg-green-500/10 text-green-400"
                                                : "bg-red-500/10 text-red-400"
                                        )}
                                    >
                                        <div className={cn("size-1.5 rounded-full mr-2", cacheStats.enabled ? "bg-green-400 animate-pulse" : "bg-red-400")} />
                                        {cacheStats.enabled ? "ACTIVE" : "OFFLINE"}
                                    </Badge>
                                </div>
                            </div>

                            {/* Action Area */}
                            {canManageCache && (
                                <div className="flex items-center justify-between pt-5 border-t border-neutral-800/50">
                                    <p className="text-[12px] text-neutral-500">
                                        Clearing the cache forces the RAG pipeline to regenerate embeddings for subsequent queries.
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-2 bg-transparent text-red-400 border-red-900/50 hover:bg-red-950/30 hover:text-red-300 transition-colors"
                                        onClick={() => setClearConfirm(true)}
                                    >
                                        <Trash2 className="size-3.5" />
                                        <span className="text-[12px] font-medium">Flush Cache</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={clearConfirm}
                onOpenChange={setClearConfirm}
                title="Flush query cache?"
                description="This will instantly remove all cached vector similarities. The system will re-run the full retrieval pipeline for all subsequent queries until the cache is rebuilt."
                confirmLabel="Flush Cache"
                variant="destructive"
                onConfirm={handleClearCache}
            />
        </div>
    )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
    icon: Icon, label, value, iconColor, iconBg
}: { icon: React.ElementType; label: string; value: string; iconColor: string; iconBg: string; }) {
    return (
        <div className="relative overflow-hidden rounded-2xl bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl p-5 ring-1 ring-inset ring-neutral-200/60 dark:ring-white/10 shadow-sm hover:shadow-md transition-all duration-300 group">
            {/* Soft background glow */}
            <div className="absolute -top-10 -right-10 size-32 rounded-full bg-gradient-to-br from-violet-500/5 to-purple-500/5 blur-2xl group-hover:from-violet-500/10 transition-colors duration-500 pointer-events-none" />

            <div className="flex items-center gap-3 mb-4 relative z-10">
                <div className={cn("flex size-8 items-center justify-center rounded-xl", iconBg, iconColor)}>
                    <Icon className="size-4" />
                </div>
                <span className="text-[12px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{label}</span>
            </div>
            <p className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white relative z-10">
                {value}
            </p>
        </div>
    )
}

function TerminalStat({ label, value }: { label: string, value: string | number }) {
    return (
        <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-mono text-neutral-500">{label}</p>
            <p className="text-lg font-mono text-neutral-200">{value}</p>
        </div>
    )
}