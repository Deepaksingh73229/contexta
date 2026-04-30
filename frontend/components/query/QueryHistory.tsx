// components/query/QueryHistory.tsx
"use client"

import { History, Trash2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { useQuery } from "@/lib/hooks"
import { CONFIDENCE_COLORS, timeAgo, truncate } from "@/utils"
import { cn } from "@/utils/cn"

export function QueryHistory() {
    const { history, clearHistory, removeHistory, restoreHistory } = useQuery()

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-10 items-center justify-between border-b border-border px-3">
                <div className="flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">History</span>
                </div>
                {history.length > 0 && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground"
                        onClick={clearHistory}
                        aria-label="Clear history"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-0.5">
                    {history.map((entry) => (
                        <div
                            key={entry.id}
                            className="group relative rounded-md px-2 py-2 hover:bg-accent transition-colors cursor-pointer"
                            onClick={() => restoreHistory(entry.id)}
                        >
                            <p className="text-xs font-medium leading-snug pr-6 line-clamp-2">
                                {entry.query}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5">
                                <Badge
                                    variant="outline"
                                    className={cn("h-4 px-1 text-[10px]", CONFIDENCE_COLORS[entry.response.confidence])}
                                >
                                    {entry.response.confidence}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">
                                    {timeAgo(entry.timestamp / 1000)}
                                </span>
                            </div>

                            {/* Actions on hover */}
                            <div className="absolute right-1 top-1 hidden group-hover:flex gap-0.5">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={(e) => { e.stopPropagation(); restoreHistory(entry.id) }}
                                    aria-label="Restore"
                                >
                                    <RotateCcw className="h-3 w-3" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-destructive"
                                    onClick={(e) => { e.stopPropagation(); removeHistory(entry.id) }}
                                    aria-label="Remove"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    ))}

                    {history.length === 0 && (
                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                            No queries yet
                        </p>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}