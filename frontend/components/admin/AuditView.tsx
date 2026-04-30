// components/admin/AuditView.tsx
"use client"

import { useState, useEffect } from "react"
import { ClipboardList, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { adminService } from "@/services"
import { formatTimestamp } from "@/utils"
import { cn } from "@/utils/cn"
import type { AuditEntry } from "@/types"

// Action → color mapping
const ACTION_COLOR: Record<string, string> = {
    "auth.login": "text-emerald-600 dark:text-emerald-400",
    "auth.login_failed": "text-rose-600 dark:text-rose-400",
    "auth.logout": "text-muted-foreground",
    "ingest.create": "text-blue-600 dark:text-blue-400",
    "query.execute": "text-violet-600 dark:text-violet-400",
    "task.cancel": "text-amber-600 dark:text-amber-400",
    "cache.clear": "text-orange-600 dark:text-orange-400",
    "admin.user_create": "text-blue-600 dark:text-blue-400",
    "admin.user_delete": "text-rose-600 dark:text-rose-400",
    "admin.password_reset": "text-amber-600 dark:text-amber-400",
}

function actionColor(action: string): string {
    return ACTION_COLOR[action] ?? "text-muted-foreground"
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
        <div className="space-y-6">
            <PageHeader
                title="Audit Log"
                description="All user actions recorded server-side for security and compliance."
                action={
                    <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                        <RefreshCw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} />
                        Refresh
                    </Button>
                }
            />

            {/* Toolbar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Filter by action, detail…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>
                <Badge variant="outline" className="text-xs">
                    {filtered.length} entries
                </Badge>
            </div>

            {/* Log */}
            {loading && entries.length === 0 ? (
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-xl" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No audit entries found" />
            ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                    {/* Column headers */}
                    <div className="grid grid-cols-[auto_1fr_2fr] gap-4 border-b border-border bg-muted/40 px-4 py-2">
                        {["Time", "Action", "Detail"].map((h) => (
                            <span key={h} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {h}
                            </span>
                        ))}
                    </div>

                    <ScrollArea className="max-h-[60vh]">
                        <div className="divide-y divide-border">
                            {filtered.map((entry, idx) => (
                                <div
                                    key={idx}
                                    className="grid grid-cols-[auto_1fr_2fr] items-start gap-4 bg-card px-4 py-3 hover:bg-accent/30 transition-colors"
                                >
                                    <span className="text-[11px] text-muted-foreground whitespace-nowrap font-mono pt-0.5">
                                        {formatTimestamp(entry.ts)}
                                    </span>
                                    <span className={cn("text-xs font-mono", actionColor(entry.action))}>
                                        {entry.action}
                                    </span>
                                    <span className="text-xs text-muted-foreground break-words leading-relaxed">
                                        {entry.detail}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            )}

            {/* Load more */}
            {entries.length >= limit && (
                <div className="flex justify-center">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLimit((l) => l + 100)}
                        disabled={loading}
                    >
                        Load more
                    </Button>
                </div>
            )}
        </div>
    )
}