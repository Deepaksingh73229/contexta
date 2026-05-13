"use client"

import { useEffect, useState } from "react"
import {
    FileText, RefreshCw, Trash2, Database,
    Zap, Terminal, Layers, Box
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useQuery } from "@/lib/hooks"
import { usePermission } from "@/lib/hooks"
import { useToast } from "@/components/ui/use-toast"
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
        <div className="max-w-6xl mx-auto space-y-8">
            <PageHeader
                title="Knowledge Base"
                description="Manage your ingested institutional data and vector store metrics."
                action={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refreshDocuments}
                        disabled={isLoading}
                        className={cn(
                            "h-9 gap-2 rounded-full transition-all duration-300 shadow-sm group",
                            "border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md",
                            "hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                        )}
                    >
                        <RefreshCw className={cn(
                            "size-3.5 text-zinc-500 transition-colors group-hover:text-zinc-700 dark:group-hover:text-zinc-300",
                            isLoading && "animate-spin text-violet-500 dark:text-violet-400"
                        )} />
                        <span className="text-[12px] font-bold tracking-wide">Sync Data</span>
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
                    valueColor="text-blue-500/30"
                    iconBg="bg-blue-500/10 border-blue-500/20"
                />

                <StatCard
                    icon={Layers}
                    label="Vector Nodes"
                    value={String(totalNodes)}
                    iconColor="text-violet-500"
                    valueColor="text-violet-500/30"
                    iconBg="bg-violet-500/10 border-violet-500/20"
                />

                {canViewCache && cacheStats && (
                    <StatCard
                        icon={Zap}
                        label="Cache Utilization"
                        value={`${cacheStats.entries} / ${cacheStats.max_entries}`}
                        iconColor="text-emerald-500"
                        valueColor="text-emerald-500/30"
                        iconBg="bg-emerald-500/10 border-emerald-500/20"
                    />
                )}
            </div>

            {/* ── Document List ────────────────────────────────────────────────── */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Database className="size-4 text-zinc-400 dark:text-zinc-500" />

                    <h2 className="text-[13px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                        Indexed Documents
                    </h2>
                </div>

                {isLoading && documents.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-[88px] w-full rounded-2xl bg-zinc-200/50 dark:bg-zinc-800/50" />
                        ))}
                    </div>
                ) : documents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
                        <EmptyState
                            icon={Box}
                            title="Vector store is empty"
                            description="Upload PDFs to start building Contexta's knowledge base."
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {documents.map((doc) => (
                            <div
                                key={doc.doc_id}
                                className="
                                    group flex items-center gap-4 p-4 rounded-2xl relative overflow-hidden
                                    bg-white/80 dark:bg-[#121214]/80 backdrop-blur-xl
                                    border border-zinc-200/60 dark:border-zinc-800/80
                                    shadow-[0_4px_15px_rgb(0,0,0,0.02)] dark:shadow-[0_4px_15px_rgb(0,0,0,0.2)]
                                    hover:-translate-y-0.5 transition-all duration-300 ease-out
                                "
                            >
                                {/* Hover linear Border Effect */}
                                <div className="absolute inset-0 bg-linear-to-br from-violet-500/0 to-fuchsia-500/0 group-hover:from-violet-500/5 group-hover:to-fuchsia-500/5 transition-colors duration-500 pointer-events-none" />
                                <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-transparent group-hover:ring-violet-500/20 transition-all duration-500 pointer-events-none" />

                                {/* Document Icon */}
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 border border-zinc-200/50 dark:border-zinc-700/50 shadow-sm transition-colors group-hover:border-violet-200 dark:group-hover:border-violet-500/30">
                                    <FileText className="size-5 text-zinc-500 dark:text-zinc-400 group-hover:text-violet-500 transition-colors" />
                                </div>

                                {/* Meta */}
                                <div className="min-w-0 flex-1 relative z-10">
                                    <p className="truncate text-[14px] font-bold text-zinc-900 dark:text-white mb-1 tracking-tight">
                                        {doc.filename}
                                    </p>
                                    <div className="flex items-center gap-2.5">
                                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono tracking-widest bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800">
                                            ID: {doc.doc_id.slice(0, 8)}
                                        </Badge>
                                        <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                                            {doc.nodes} nodes
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
                <div className="">
                    <div className="relative overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-950 ring-1 ring-inset ring-zinc-100 dark:ring-zinc-800 shadow-2xl shadow-black/40">
                        {/* Top Glare */}
                        <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-sky-800/50 to-transparent pointer-events-none" />

                        {/* Fake Mac Toolbar */}
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-200 dark:bg-neutral-900 border-b border-zinc-800/80">
                            <div className="flex gap-1.5">
                                <div className="size-2.5 rounded-full bg-red-700/50 border border-red-600/50" />
                                <div className="size-2.5 rounded-full bg-amber-700/50 border border-amber-600/50" />
                                <div className="size-2.5 rounded-full bg-emerald-700/50 border border-emerald-600/50" />
                            </div>

                            <div className="flex items-center gap-1.5 text-zinc-500 absolute left-1/2 -translate-x-1/2">
                                <Terminal className="size-3" />

                                <span className="text-[10px] font-mono font-medium tracking-widest uppercase">
                                    query_cache.exe
                                </span>
                            </div>
                        </div>

                        {/* Stats Readout */}
                        <div className="flex flex-col gap-3 px-5 py-2.5 bg-[radial-linear(ellipse_at_top,_var(--tw-linear-stops))] from-zinc-900/40 to-neutral-900">
                            <div className="grid grid-cols-3 gap-6 sm:grid-cols-4">
                                <TerminalStat label="Current_Entries" value={cacheStats.entries} />
                                <TerminalStat label="Max_Allocation" value={cacheStats.max_entries.toLocaleString()} />
                                <TerminalStat label="TTL_Threshold" value={`${Math.round(cacheStats.ttl_seconds / 86400)}d`} />

                                <div>
                                    <p className="text-[10px] font-mono text-zinc-900 dark:text-zinc-500">System_Status</p>

                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "h-5 px-2 font-mono text-[11px] tracking-widest border border-transparent shadow-none rounded-md",
                                            cacheStats.enabled
                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                : "bg-red-500/10 text-red-400 border-red-500/20"
                                        )}
                                    >
                                        <div className={cn("size-1.5 rounded-full", cacheStats.enabled ? "bg-emerald-400 animate-[pulse_2s_ease-in-out_infinite]" : "bg-red-400")} />
                                        {cacheStats.enabled ? "ACTIVE" : "OFFLINE"}
                                    </Badge>
                                </div>
                            </div>

                            {/* Action Area */}
                            {canManageCache && (
                                <div className="py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-zinc-800/50">
                                    <p className="text-[11px] font-mono text-zinc-500 leading-relaxed max-w-lg">
                                        &gt; Warning: Clearing the cache forces the RAG pipeline to regenerate embeddings for subsequent queries.
                                    </p>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-2 bg-transparent text-red-400 border-red-900/50 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-colors shrink-0 font-mono text-xs uppercase tracking-wider cursor-pointer"
                                        onClick={() => setClearConfirm(true)}
                                    >
                                        <Trash2 className="size-3.5" />
                                        Flush_Cache()
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
    icon: Icon, label, value, iconColor, iconBg, valueColor
}: { icon: React.ElementType; label: string; value: string; iconColor: string; valueColor: string; iconBg: string; }) {
    return (
        <div className="relative overflow-hidden rounded-2xl bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl p-5 border border-zinc-200/60 dark:border-zinc-800/80 shadow-[0_4px_15px_rgb(0,0,0,0.02)] dark:shadow-[0_4px_15px_rgb(0,0,0,0.1)] group hover:-translate-y-0.5 transition-all duration-300">
            {/* Top inner glare line for 3D realism */}
            <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-sky-800 to-transparent rounded-t-2xl pointer-events-none" />

            {/* Soft background glow */}
            <div className="absolute -top-10 -right-10 size-32 rounded-full bg-zinc-500/5 blur-2xl group-hover:bg-sky-500/10 transition-colors duration-500 pointer-events-none" />

            <div className="flex items-center gap-3">
                <div className={cn("flex size-8 items-center justify-center rounded-lg border", iconBg, iconColor)}>
                    <Icon className="size-4" />
                </div>

                <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{label}</span>
            </div>
            
            <p className={`text-5xl text-end font-black tracking-tight ${valueColor}`}>
                {value}
            </p>
        </div>
    )
}

function TerminalStat({ label, value }: { label: string, value: string | number }) {
    return (
        <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-mono text-zinc-900 dark:text-zinc-500">{label}</p>
            <p className="text-[15px] font-mono text-zinc-700 dark:text-zinc-300 font-semibold">{value}</p>
        </div>
    )
}