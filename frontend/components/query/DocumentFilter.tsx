"use client"

import { Filter, ChevronDown, CheckSquare, Square } from "lucide-react"
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
            <div className="flex h-14 items-center px-5 border-b border-neutral-200/60 dark:border-white/5 bg-white/60 dark:bg-[#0A0A0A]/60 backdrop-blur-md z-10 sticky top-0 transition-colors">
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-900/50 text-neutral-500 dark:text-neutral-400">
                    <Filter className="size-3.5" />
                    <p className="text-[12px] font-medium tracking-wide">Searching all documents</p>
                </div>
            </div>
        )
    }

    // ── Active State ─────────────────────────────────────────────────────────
    const scopedCount = selectedIds.length
    const label = scopedCount === 0
        ? "Searching all documents"
        : `${scopedCount} of ${documents.length} selected`

    const isAllSelected = scopedCount === documents.length

    return (
        <div className="flex h-14 items-center justify-between px-5 border-b border-neutral-200/60 dark:border-white/5 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-20 transition-colors">

            {/* Status Label */}
            <div className="flex items-center gap-3">
                <div className={cn(
                    "flex items-center justify-center size-7 rounded-lg shadow-inner transition-colors duration-300",
                    scopedCount > 0
                        ? "bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                )}>
                    <Filter className="size-3.5" />
                </div>
                <span className={cn(
                    "text-[13px] font-medium transition-colors duration-300",
                    scopedCount > 0
                        ? "text-neutral-900 dark:text-white font-semibold"
                        : "text-neutral-500 dark:text-neutral-400"
                )}>
                    {label}
                </span>
            </div>

            {/* Interactive Filter Dropdown */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="
                            h-8 gap-2 rounded-full px-3 
                            border-neutral-200 dark:border-neutral-800 
                            bg-white dark:bg-neutral-900 
                            hover:bg-neutral-50 dark:hover:bg-neutral-800 
                            hover:border-neutral-300 dark:hover:border-neutral-700
                            transition-all duration-200
                        "
                    >
                        <span className="text-[12px] font-medium text-neutral-600 dark:text-neutral-300">
                            Scope
                        </span>

                        {scopedCount > 0 && (
                            <div className="flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-violet-600 dark:bg-violet-500 text-[10px] font-bold text-white shadow-sm shadow-violet-500/30">
                                {scopedCount}
                            </div>
                        )}

                        <ChevronDown className="size-3.5 text-neutral-400" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent
                    align="end"
                    className="
                        w-80 p-0 
                        bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl 
                        border-neutral-200/80 dark:border-white/10 
                        rounded-xl shadow-xl shadow-neutral-200/50 dark:shadow-black/50
                        animate-in zoom-in-95 duration-200
                    "
                >
                    {/* Header: Segmented Controls */}
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-100 dark:border-white/5 bg-[#FAFAFA]/50 dark:bg-[#111]/50 rounded-t-xl">
                        <p className="text-[12px] font-semibold text-neutral-900 dark:text-white ml-1">
                            Filter Data Sources
                        </p>

                        <div className="flex items-center gap-0.5 bg-neutral-200/50 dark:bg-neutral-800 p-0.5 rounded-lg">
                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "h-6 px-2.5 text-[11px] rounded-md transition-all duration-200",
                                    isAllSelected
                                        ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                                        : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700/50"
                                )}
                                onClick={selectAll}
                            >
                                All
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "h-6 px-2.5 text-[11px] rounded-md transition-all duration-200",
                                    scopedCount === 0
                                        ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                                        : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700/50"
                                )}
                                onClick={clear}
                            >
                                None
                            </Button>
                        </div>
                    </div>

                    {/* Document List */}
                    <ScrollArea className="max-h-[300px]">
                        <div className="p-1.5 space-y-0.5">
                            {documents.map((doc) => {
                                const checked = isSelected(doc.doc_id);
                                return (
                                    <label
                                        key={doc.doc_id}
                                        className={cn(
                                            "group flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-pointer transition-colors duration-200",
                                            checked
                                                ? "bg-violet-50/50 dark:bg-violet-500/10"
                                                : "hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                                        )}
                                    >
                                        <Checkbox
                                            checked={checked}
                                            onCheckedChange={() => toggle(doc.doc_id)}
                                            className={cn(
                                                "size-4 transition-all duration-200",
                                                checked
                                                    ? "border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500"
                                                    : "border-neutral-300 dark:border-neutral-600"
                                            )}
                                        />

                                        <div className="flex flex-col flex-1 min-w-0">
                                            <span className={cn(
                                                "text-[13px] truncate transition-colors duration-200",
                                                checked
                                                    ? "font-semibold text-violet-900 dark:text-violet-100"
                                                    : "font-medium text-neutral-700 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-white"
                                            )}>
                                                {doc.filename}
                                            </span>
                                        </div>

                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "shrink-0 h-5 px-1.5 text-[10px] font-semibold border-neutral-200 dark:border-neutral-800 transition-colors duration-200",
                                                checked
                                                    ? "text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800 bg-violet-100/50 dark:bg-violet-900/30"
                                                    : "text-neutral-400 dark:text-neutral-500"
                                            )}
                                        >
                                            {doc.nodes} nodes
                                        </Badge>
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