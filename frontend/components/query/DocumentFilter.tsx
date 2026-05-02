"use client"

import { Filter, ChevronDown, Database, Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { useDocuments } from "@/lib/hooks"
import { usePermission } from "@/lib/hooks"
import { cn } from "@/utils/cn"

export function DocumentFilter() {
    const { documents, selectedIds, isSelected, toggle, clear, selectAll } = useDocuments()
    const { canViewDocs } = usePermission()

    // ── Read-only / Empty State ──────────────────────────────────────────────
    if (!canViewDocs || documents.length === 0) {
        return (
            <div className="flex h-14 items-center px-5 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-white/60 dark:bg-[#0A0A0C]/60 backdrop-blur-xl z-30 sticky top-0 transition-colors">
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-100/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 shadow-sm">
                    <Database className="size-3.5 text-zinc-400 dark:text-zinc-500" />
                    <p className="text-[12px] font-semibold tracking-wide">Searching all verified documents</p>
                </div>
            </div>
        )
    }

    // ── Active State ─────────────────────────────────────────────────────────
    const scopedCount = selectedIds.length
    const label = scopedCount === 0
        ? "Searching entire knowledge base"
        : `Targeting ${scopedCount} of ${documents.length} sources`

    const isAllSelected = scopedCount === documents.length

    return (
        <div className="flex h-20 items-center justify-between px-5 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-white/60 dark:bg-[#0A0A0C]/60 backdrop-blur-xl sticky top-0 z-30 transition-colors">
            {/* ── Status Label ───────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
                <Filter className="size-10 text-violet-700" />

                <div className="flex flex-col">
                    <span className="text-2xl font-black uppercase tracking-wider text-violet-500/80">
                        Context Scope
                    </span>

                    <span className={cn(
                        "text-[13px] font-medium transition-colors duration-300 tracking-tight",
                        scopedCount > 0
                            ? "text-zinc-900 dark:text-white font-semibold"
                            : "text-zinc-600 dark:text-zinc-400"
                    )}>
                        {label}
                    </span>
                </div>
            </div>

            {/* ── Interactive Filter Dropdown ─────────────────────────────── */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            "h-9 gap-2.5 rounded-full px-4 transition-all duration-300 group shadow-sm",
                            "border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm",
                            "hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
                            scopedCount > 0 && "border-violet-200 dark:border-violet-500/30 bg-violet-50/50 dark:bg-violet-500/5 hover:bg-violet-100 dark:hover:bg-violet-500/10"
                        )}
                    >
                        <span className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
                            Adjust Scope
                        </span>

                        {scopedCount > 0 && (
                            <div className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-violet-500 text-[11px] font-bold text-white shadow-sm shadow-violet-500/20">
                                {scopedCount}
                            </div>
                        )}

                        <ChevronDown className="size-3.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent
                    align="end"
                    sideOffset={8}
                    className="
                        w-80 p-0 
                        bg-white/95 dark:bg-[#121214]/95 backdrop-blur-2xl 
                        border-zinc-200/80 dark:border-zinc-800/80 
                        rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/40
                        animate-in zoom-in-95 fade-in slide-in-from-top-2 duration-200
                        overflow-hidden relative
                    "
                >
                    {/* Top Glare */}
                    <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent pointer-events-none" />

                    {/* ── Header: Segmented Controls ───────────────────────── */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/20">
                        <p className="text-[12px] font-bold text-zinc-900 dark:text-white tracking-wide">
                            Filter Sources
                        </p>

                        {/* macOS style segmented control */}
                        <div className="flex items-center p-0.5 bg-zinc-200/60 dark:bg-zinc-950 rounded-lg border border-zinc-300/50 dark:border-zinc-800/50 shadow-inner">
                            <button
                                onClick={selectAll}
                                className={cn(
                                    "px-3 py-1 text-[11px] font-bold rounded-md transition-all duration-200 ease-out",
                                    isAllSelected
                                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                                )}
                            >
                                All
                            </button>
                            <button
                                onClick={clear}
                                className={cn(
                                    "px-3 py-1 text-[11px] font-bold rounded-md transition-all duration-200 ease-out",
                                    scopedCount === 0
                                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                                )}
                            >
                                None
                            </button>
                        </div>
                    </div>

                    {/* ── Document List ────────────────────────────────────── */}
                    <ScrollArea className="max-h-[320px]">
                        <div className="p-2 space-y-0.5">
                            {documents.map((doc) => {
                                const checked = isSelected(doc.doc_id);
                                return (
                                    <label
                                        key={doc.doc_id}
                                        className={cn(
                                            "group flex items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-200 ease-out",
                                            checked
                                                ? "bg-violet-50/80 dark:bg-violet-500/10"
                                                : "hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50"
                                        )}
                                    >
                                        <div className="pt-0.5">
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={() => toggle(doc.doc_id)}
                                                className={cn(
                                                    "size-4.5 rounded-[4px] transition-all duration-200 border-zinc-300 dark:border-zinc-700",
                                                    checked && "border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500 shadow-sm shadow-violet-500/20"
                                                )}
                                            />
                                        </div>

                                        <div className="flex flex-col flex-1 min-w-0">
                                            <span className={cn(
                                                "text-[13px] truncate transition-colors duration-200 tracking-tight",
                                                checked
                                                    ? "font-bold text-violet-900 dark:text-violet-100"
                                                    : "font-semibold text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white"
                                            )}>
                                                {doc.filename}
                                            </span>

                                            {/* Sub-info layout */}
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={cn(
                                                    "text-[10px] font-bold uppercase tracking-widest",
                                                    checked ? "text-violet-600/70 dark:text-violet-400/70" : "text-zinc-400 dark:text-zinc-500"
                                                )}>
                                                    {doc.nodes} Chunks
                                                </span>
                                            </div>
                                        </div>

                                        {/* Visual confirmation tick instead of just a badge */}
                                        {checked && (
                                            <Check className="size-4 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5 animate-in zoom-in duration-200" />
                                        )}
                                    </label>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </PopoverContent>
            </Popover>
        </div>
    )
}