"use client"

import { useState, useEffect } from "react"
import { ClipboardList, RefreshCw, Search, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { adminService } from "@/services"
import { formatTimestamp } from "@/utils"
import { cn } from "@/utils/cn"
import type { AuditEntry } from "@/types"

// Action → SaaS-Modern Badge mapping (Background, Text, and Border)
const ACTION_STYLES: Record<string, string> = {
    "auth.login": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    "auth.login_failed": "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    "auth.logout": "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20",
    "ingest.create": "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    "query.execute": "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    "task.cancel": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    "cache.clear": "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    "admin.user_create": "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    "admin.user_delete": "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    "admin.password_reset": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
}

function getActionStyle(action: string): string {
    return ACTION_STYLES[action] ?? "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20"
}

export function AuditView() {
    const [entries, setEntries] = useState<AuditEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [limit, setLimit] = useState(100)

    const load = async () => {
        setLoading(true)
        try {
            const res = await adminService.getAuditLog(limit)
            setEntries(res.entries)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [limit]) // eslint-disable-line

    const filtered = entries.filter(
        (e) =>
            search === "" ||
            e.action.includes(search.toLowerCase()) ||
            e.detail.toLowerCase().includes(search.toLowerCase()) ||
            e.user_id.includes(search),
    )

    return (
        <div className="w-full mx-auto space-y-8 animate-in fade-in duration-500">
            <PageHeader
                title="Security & Audit Log"
                description="Immutable record of user actions, authentication events, and system changes."
                action={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={load}
                        disabled={loading}
                        className="h-9 gap-2 rounded-full border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all shadow-sm"
                    >
                        <RefreshCw className={cn("size-3.5 text-neutral-500", loading && "animate-spin text-violet-500")} />
                        <span className="text-[13px] font-medium">Sync Logs</span>
                    </Button>
                }
            />

            {/* ── Filter Toolbar ────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/40 dark:bg-neutral-900/40 p-3 rounded-2xl border border-neutral-200/60 dark:border-white/5 shadow-sm">
                <div className="relative w-full sm:max-w-md group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                        <Search className="size-4 text-neutral-400 group-focus-within:text-violet-500 transition-colors" />
                    </div>
                    <Input
                        placeholder="Search events, actions, or User IDs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 h-10 rounded-xl bg-white dark:bg-[#0A0A0A] border-neutral-200/80 dark:border-white/10 focus-visible:ring-2 focus-visible:ring-violet-500/50 shadow-sm transition-all text-[14px]"
                    />
                </div>
                <div className="flex items-center gap-2 px-2 sm:px-0">
                    <Activity className="size-4 text-neutral-400" />
                    <span className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">
                        {filtered.length} <span className="text-neutral-400 font-medium">Events Found</span>
                    </span>
                </div>
            </div>

            {/* ── Log Container ─────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white/60 dark:bg-[#0A0A0A]/60 backdrop-blur-md shadow-sm overflow-hidden flex flex-col">

                {/* Column Headers */}
                <div className="grid grid-cols-[140px_180px_1fr] sm:grid-cols-[160px_200px_1fr] gap-4 border-b border-neutral-200 dark:border-white/10 bg-neutral-50/80 dark:bg-neutral-900/80 px-5 py-3 sticky top-0 z-10 backdrop-blur-md">
                    {["Timestamp", "Event Action", "Event Detail"].map((h) => (
                        <span key={h} className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                            {h}
                        </span>
                    ))}
                </div>

                {/* Log Data */}
                {loading && entries.length === 0 ? (
                    <div className="p-4 space-y-3">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-xl bg-neutral-200/50 dark:bg-neutral-800/50" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-12">
                        <EmptyState
                            icon={ClipboardList}
                            title="No audit entries found"
                            description={search ? "Try adjusting your search filters." : "The system has not recorded any events yet."}
                        />
                    </div>
                ) : (
                    <ScrollArea className="max-h-[60vh]">
                        <div className="divide-y divide-neutral-100 dark:divide-white/5">
                            {filtered.map((entry, idx) => (
                                <div
                                    key={idx}
                                    className="grid grid-cols-[140px_180px_1fr] sm:grid-cols-[160px_200px_1fr] items-start gap-4 px-5 py-3.5 hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors group"
                                >
                                    {/* Timestamp */}
                                    <span className="text-[12px] text-neutral-400 dark:text-neutral-500 font-mono tracking-tight pt-1 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors">
                                        {formatTimestamp(entry.ts)}
                                    </span>

                                    {/* Action Badge */}
                                    <div className="flex items-start pt-0.5">
                                        <span className={cn(
                                            "inline-flex px-2 py-0.5 rounded-md border text-[11px] font-mono font-bold tracking-tight shadow-sm",
                                            getActionStyle(entry.action)
                                        )}>
                                            {entry.action}
                                        </span>
                                    </div>

                                    {/* Event Detail */}
                                    <span className="text-[13px] text-neutral-700 dark:text-neutral-300 leading-relaxed pt-0.5 break-words pr-4">
                                        {entry.detail}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </div>

            {/* ── Load More Action ─────────────────────────────────────────── */}
            {entries.length >= limit && (
                <div className="flex justify-center pt-2 pb-8">
                    <Button
                        variant="outline"
                        className="h-10 px-6 rounded-full bg-white dark:bg-[#0A0A0A] border-neutral-200 dark:border-neutral-800 hover:border-violet-300 dark:hover:border-violet-700 text-[13px] font-semibold text-neutral-600 dark:text-neutral-300 transition-all shadow-sm hover:shadow-md active:scale-95"
                        onClick={() => setLimit((l) => l + 100)}
                        disabled={loading}
                    >
                        {loading ? "Loading..." : "Load Older Events"}
                    </Button>
                </div>
            )}
        </div>
    )
}