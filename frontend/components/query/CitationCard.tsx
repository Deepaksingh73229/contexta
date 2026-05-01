"use client"

import { useState } from "react"
import { ExternalLink, FileText, BookOpen, ChevronRight, File } from "lucide-react"
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

    // Extract extension for a nice visual badge, fallback to 'DOC'
    const extension = source.filename.split('.').pop()?.toUpperCase() || 'DOC'

    return (
        <>
            {/* ── Interactive Citation Chip ────────────────────────────── */}
            <div
                onClick={() => setOpen(true)}
                onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}
                role="button"
                tabIndex={0}
                className="
                    group relative flex items-center gap-3.5 
                    rounded-xl p-3 pr-10 text-left
                    bg-white/80 dark:bg-neutral-900/50 backdrop-blur-md
                    ring-1 ring-inset ring-neutral-200/80 dark:ring-white/10
                    shadow-sm shadow-neutral-200/30 dark:shadow-none
                    hover:bg-white dark:hover:bg-neutral-800/80
                    hover:ring-violet-300 dark:hover:ring-violet-500/40
                    hover:-translate-y-0.5 hover:shadow-md hover:shadow-neutral-200/50 dark:hover:shadow-black/40
                    transition-all duration-300 ease-out cursor-pointer outline-none
                    focus-visible:ring-2 focus-visible:ring-violet-500
                "
                aria-label={`View source document: ${source.title}`}
            >
                {/* Icon Container with subtle gradient */}
                <div className="flex items-center justify-center size-9 rounded-lg bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-500/10 dark:to-violet-500/20 text-violet-600 dark:text-violet-400 shrink-0 shadow-inner">
                    <FileText className="size-4.5" />
                </div>

                {/* Text Content */}
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <p className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100 truncate mb-0.5">
                        {source.title}
                    </p>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-[9px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest leading-none">
                            {extension}
                        </span>
                        <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 truncate">
                            {source.filename}
                        </p>
                    </div>
                </div>

                {/* Hover Action Indicator */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 dark:text-neutral-600 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors duration-300">
                    <ChevronRight className="size-4.5 group-hover:translate-x-0.5 transition-transform duration-300" />
                </div>
            </div>

            {/* ── Premium PDF Previewer Modal ──────────────────────────── */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="
                    sm:max-w-5xl h-[85vh] flex flex-col p-0 gap-0 
                    overflow-hidden border-0 
                    bg-white dark:bg-[#0A0A0A]
                    shadow-2xl shadow-black/20 dark:shadow-black/80
                    sm:rounded-2xl
                ">
                    {/* Header Toolbar */}
                    <DialogHeader className="px-4 py-3 bg-[#FAFAFA] dark:bg-[#111111] border-b border-neutral-200/80 dark:border-white/10 shrink-0">
                        <DialogTitle className="flex items-center gap-3 text-sm">
                            <div className="flex items-center justify-center size-8 rounded-md bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 shrink-0">
                                <BookOpen className="size-4" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-neutral-900 dark:text-white truncate text-[14px]">
                                    {source.title}
                                </span>
                                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium truncate">
                                    {source.filename}
                                </span>
                            </div>

                            {/* Action Buttons */}
                            <div className="ml-auto flex items-center gap-1.5 pr-6"> {/* pr-6 to avoid overlap with Shadcn default close button */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-2 text-[12px] font-medium hidden sm:flex border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                    asChild
                                >
                                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" aria-label="Open in new tab">
                                        Open in Browser
                                        <ExternalLink className="size-3.5" />
                                    </a>
                                </Button>
                                {/* Mobile version of the button */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 sm:hidden text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                                    asChild
                                >
                                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" aria-label="Open in new tab">
                                        <ExternalLink className="size-4" />
                                    </a>
                                </Button>
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    {/* PDF Viewer Container */}
                    <div className="flex-1 overflow-hidden relative bg-neutral-100/50 dark:bg-neutral-950">
                        {/* Subtle inner shadow for depth */}
                        <div className="absolute inset-0 pointer-events-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] dark:shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)] z-10" />
                        <iframe
                            src={pdfUrl}
                            className="h-full w-full border-0"
                            title={`PDF Viewer: ${source.filename}`}
                            loading="lazy"
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}