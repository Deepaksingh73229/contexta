"use client"

import { History, Trash2, RotateCcw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useQuery } from "@/lib/hooks"
import { CONFIDENCE_COLORS, timeAgo, truncate } from "@/utils"
import { cn } from "@/utils/cn"

export function QueryHistory() {
    const { history, clearHistory, removeHistory, restoreHistory } = useQuery()

    return (
        <div className="flex h-full flex-col bg-[#FAFAFA]/50 dark:bg-[#0A0A0A]/50">
            {/* ── Sticky Header ────────────────────────────────────────────── */}
            <div className="flex h-14 items-center justify-between border-b border-neutral-200/60 dark:border-white/5 bg-white/60 dark:bg-neutral-950/60 backdrop-blur-md px-4 shrink-0 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center size-7 rounded-lg bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400">
                        <History className="size-3.5" />
                    </div>
                    <span className="text-[13px] font-semibold text-neutral-900 dark:text-white">
                        Recent Queries
                    </span>
                    {history.length > 0 && (
                        <Badge variant="secondary" className="ml-1 h-4.5 px-1.5 text-[10px] font-bold bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                            {history.length}
                        </Badge>
                    )}
                </div>

                {history.length > 0 && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors rounded-xl"
                        onClick={clearHistory}
                        aria-label="Clear all history"
                        title="Clear History"
                    >
                        <Trash2 className="size-4" />
                    </Button>
                )}
            </div>

            {/* ── History List ─────────────────────────────────────────────── */}
            <ScrollArea className="flex-1">
                <div className="p-3 space-y-1">
                    {history.map((entry) => (
                        <div
                            key={entry.id}
                            className="
                                group relative rounded-xl p-3 
                                bg-transparent hover:bg-white dark:hover:bg-neutral-900
                                border border-transparent hover:border-neutral-200/80 dark:hover:border-white/10
                                hover:shadow-sm hover:shadow-neutral-200/30 dark:hover:shadow-black/20
                                transition-all duration-300 ease-out cursor-pointer overflow-hidden
                            "
                            onClick={() => restoreHistory(entry.id)}
                        >
                            {/* Query Text */}
                            <p className="text-[13px] font-medium leading-relaxed text-neutral-700 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors line-clamp-2 pr-2">
                                "{entry.query}"
                            </p>

                            {/* Meta Information */}
                            <div className="mt-2.5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "h-5 px-1.5 text-[10px] font-semibold uppercase tracking-wider border-neutral-200 dark:border-neutral-800 shadow-none",
                                            CONFIDENCE_COLORS[entry.response.confidence]
                                        )}
                                    >
                                        {entry.response.confidence}
                                    </Badge>
                                    <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                                        {timeAgo(entry.timestamp / 1000)}
                                    </span>
                                </div>
                            </div>

                            {/* ── Frosted Glass Action Overlay ── */}
                            <div className="
                                absolute inset-y-0 right-0 
                                flex items-center gap-1 pl-8 pr-3
                                bg-gradient-to-l from-white via-white to-transparent dark:from-neutral-900 dark:via-neutral-900 
                                opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0
                                transition-all duration-300 ease-out pointer-events-none group-hover:pointer-events-auto
                            ">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-7 rounded-lg bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:text-violet-600 dark:hover:text-violet-400 hover:border-violet-300 dark:hover:border-violet-700/50 shadow-sm transition-colors"
                                    onClick={(e) => { e.stopPropagation(); restoreHistory(entry.id) }}
                                    aria-label="Restore query"
                                    title="Restore Query"
                                >
                                    <RotateCcw className="size-3.5" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-7 rounded-lg bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:text-red-600 hover:bg-red-50 hover:border-red-200 dark:hover:text-red-400 dark:hover:bg-red-950/30 dark:hover:border-red-900/50 shadow-sm transition-colors"
                                    onClick={(e) => { e.stopPropagation(); removeHistory(entry.id) }}
                                    aria-label="Delete query"
                                    title="Delete Query"
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))}

                    {/* ── Empty State ────────────────────────────────────────── */}
                    {history.length === 0 && (
                        <div className="flex flex-col items-center justify-center pt-12 pb-8 px-4 text-center animate-in fade-in duration-500">
                            <div className="flex items-center justify-center size-12 rounded-full bg-neutral-100 dark:bg-neutral-900 mb-3 shadow-inner">
                                <Search className="size-5 text-neutral-400 dark:text-neutral-500" />
                            </div>
                            <p className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                                No history found
                            </p>
                            <p className="text-[12px] text-neutral-500 dark:text-neutral-500 max-w-[200px]">
                                Your recent queries and conversations will appear here.
                            </p>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}