// components/query/CitationCard.tsx
"use client"

import { useState } from "react"
import { ExternalLink, FileText, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { citationsService } from "@/services"
import type { SourceCitation } from "@/types"
import { truncate } from "@/utils"

interface CitationCardProps {
    source: SourceCitation
}

export function CitationCard({ source }: CitationCardProps) {
    const [open, setOpen] = useState(false)
    const pdfUrl = citationsService.iframeUrl(source.doc_id)

    return (
        <>
            <div className="group flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:bg-accent/50">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{source.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{source.filename}</p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setOpen(true)}
                    aria-label="View PDF"
                >
                    <BookOpen className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* PDF viewer dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
                    <DialogHeader className="px-4 py-3 border-b border-border">
                        <DialogTitle className="flex items-center gap-2 text-sm">
                            <FileText className="h-4 w-4" />
                            {source.filename}
                            <span className="text-muted-foreground font-normal">— {source.title}</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="ml-auto h-7 w-7"
                                asChild
                            >
                                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" aria-label="Open in new tab">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            </Button>
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden">
                        <iframe
                            src={pdfUrl}
                            className="h-full w-full"
                            title={`PDF: ${source.filename}`}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}