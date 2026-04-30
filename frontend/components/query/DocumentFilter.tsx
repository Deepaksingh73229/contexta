// components/query/DocumentFilter.tsx
"use client"

import { Filter } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useDocuments } from "@/lib/hooks"
import { usePermission } from "@/lib/hooks"

export function DocumentFilter() {
    const { documents, selectedIds, isSelected, toggle, clear, selectAll } = useDocuments()
    const { canViewDocs } = usePermission()

    if (!canViewDocs || documents.length === 0) {
        return (
            <div className="h-10 border-b border-border flex items-center px-4">
                <p className="text-xs text-muted-foreground">Searching all documents</p>
            </div>
        )
    }

    const scopedCount = selectedIds.length
    const label = scopedCount === 0
        ? "All documents"
        : `${scopedCount} of ${documents.length} selected`

    return (
        <div className="flex h-10 items-center gap-2 border-b border-border px-4">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{label}</span>

            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 text-xs ml-1 px-2">
                        Filter
                        {scopedCount > 0 && (
                            <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                                {scopedCount}
                            </Badge>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-0">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                        <p className="text-xs font-medium">Scope search</p>
                        <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={selectAll}>
                                All
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={clear}>
                                None
                            </Button>
                        </div>
                    </div>
                    <ScrollArea className="max-h-64">
                        <div className="p-2 space-y-0.5">
                            {documents.map((doc) => (
                                <label
                                    key={doc.doc_id}
                                    className="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-accent cursor-pointer"
                                >
                                    <Checkbox
                                        checked={isSelected(doc.doc_id)}
                                        onCheckedChange={() => toggle(doc.doc_id)}
                                        className="h-3.5 w-3.5"
                                    />
                                    <span className="flex-1 min-w-0 text-xs truncate">{doc.filename}</span>
                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                        {doc.nodes} nodes
                                    </span>
                                </label>
                            ))}
                        </div>
                    </ScrollArea>
                </PopoverContent>
            </Popover>
        </div>
    )
}