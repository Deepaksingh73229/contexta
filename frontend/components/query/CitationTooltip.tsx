"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { FileText, Download, ExternalLink, X, BookOpen, Layers } from "lucide-react"
import { citationsService } from "@/services"
import type { SourceCitation } from "@/types"
import { cn } from "@/utils/cn"

interface CitationTooltipProps {
    source: SourceCitation
}

export function CitationTooltip({ source }: CitationTooltipProps) {
    const [showPreview, setShowPreview] = useState(false)
    const [showModal, setShowModal] = useState(false)

    const pdfUrl = citationsService.iframeUrl(source.doc_id)
    const extension = source.filename.split('.').pop()?.toUpperCase() || 'PDF'

    return (
        <>
            {/* ── Citation Chip ────────────────────────────────────────────── */}
            <div
                className="relative inline-block group/citation hover:z-50"
                onMouseEnter={() => setShowPreview(true)}
                onMouseLeave={() => setShowPreview(false)}
            >
                <button
                    onClick={() => setShowModal(true)}
                    className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer",
                        "bg-zinc-100/80 dark:bg-zinc-800/50 backdrop-blur-sm",
                        "border border-zinc-200 dark:border-zinc-700/50",
                        "hover:bg-violet-50 dark:hover:bg-violet-500/10",
                        "hover:border-violet-200 dark:hover:border-violet-500/30",
                        "hover:shadow-[0_4px_15px_rgb(139,92,246,0.1)]",
                        "transition-all duration-300 ease-out",
                        "text-[12px] font-medium text-zinc-600 dark:text-zinc-300",
                        "hover:text-violet-700 dark:hover:text-violet-300"
                    )}
                >
                    <BookOpen className="size-3.5 shrink-0 text-zinc-400 group-hover/citation:text-violet-500 transition-colors" />
                    <span className="truncate max-w-40 tracking-tight">{source.title}</span>
                </button>

                {/* ── Hover Tooltip Preview ────────────────────────────────── */}
                {showPreview && (
                    <div className="absolute bottom-[calc(100%+0.1rem)] left-0 z-50 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200 ease-out fill-mode-both">
                        <div className={cn(
                            "w-72 rounded-xl overflow-hidden relative",
                            "bg-white/95 dark:bg-[#121214]/95 backdrop-blur-xl",
                            "shadow-xl shadow-black/5 dark:shadow-black/40",
                            "border border-zinc-200/60 dark:border-zinc-800/80"
                        )}>
                            {/* Premium Top Accent Glow */}
                            <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-violet-500/50 to-transparent" />

                            <div className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 border border-zinc-200/50 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-400 shadow-sm">
                                        <FileText className="size-4" />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-bold text-zinc-900 dark:text-white truncate tracking-tight">
                                            {source.title}
                                        </p>

                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate font-medium">
                                            {source.filename}
                                        </p>

                                        {/* Telemetry Tags */}
                                        <div className="flex items-center gap-2 mt-2.5">
                                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-200 dark:ring-violet-500/30">
                                                {extension}
                                            </span>

                                            <span className="flex items-center gap-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
                                                <Layers className="size-3" />
                                                Node: {source.node_id}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tooltip Action Footer */}
                            <div className="flex gap-2 px-4 pb-4 pt-0">
                                <button
                                    onClick={() => setShowModal(true)}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] font-bold hover:bg-zinc-800 dark:hover:bg-white transition-colors shadow-sm cursor-pointer"
                                >
                                    <ExternalLink className="size-3" />
                                    Read Document
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Cinematic Full PDF Modal ─────────────────────────────────── */}
            {showModal && typeof document !== "undefined" && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12"
                    onClick={() => setShowModal(false)}
                >
                    {/* Deep Blur Backdrop */}
                    <div className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-300" />

                    {/* Modal Window */}
                    <div
                        className={cn(
                            "relative w-full max-w-6xl h-[90vh] flex flex-col rounded-2xl overflow-hidden",
                            "bg-white dark:bg-[#0A0A0C]",
                            "shadow-2xl shadow-black/40",
                            "border border-zinc-200/50 dark:border-zinc-800/80",
                            "animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-500 ease-out"
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* ── Modal Header / Toolbar ─────────────────────── */}
                        <div className="flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-[#0A0A0C]/80 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 shrink-0">

                            <div className="flex items-center gap-3 min-w-0 pr-4">
                                <div className="flex size-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0 border border-violet-200/50 dark:border-violet-500/20">
                                    <BookOpen className="size-4.5" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white truncate tracking-tight">
                                        {source.title}
                                    </h3>
                                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
                                        Secure Local Preview • {source.filename}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                <a
                                    href={pdfUrl}
                                    download={source.filename}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 text-[12px] font-semibold transition-colors"
                                >
                                    <Download className="size-4" />
                                    <span className="hidden sm:inline">Save Copy</span>
                                </a>
                                <a
                                    href={pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-300 text-[12px] font-semibold transition-colors"
                                >
                                    <ExternalLink className="size-4" />
                                    <span className="hidden sm:inline">Pop Out</span>
                                </a>

                                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1 hidden sm:block" />

                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex size-8 items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                                    aria-label="Close Preview"
                                >
                                    <X className="size-4.5" />
                                </button>
                            </div>
                        </div>

                        {/* ── PDF Viewer Canvas ──────────────────────────── */}
                        <div className="z-50 flex-1 bg-zinc-100 dark:bg-[#050505] relative">
                            {/* Loading skeleton placeholder behind iframe */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-600">
                                <FileText className="size-8 animate-pulse opacity-50" />
                                <span className="text-xs font-medium uppercase tracking-widest animate-pulse opacity-50">Decrypting Source</span>
                            </div>

                            <iframe
                                src={pdfUrl}
                                className="relative h-full w-full border-0 z-10 bg-transparent"
                                title={`PDF: ${source.filename}`}
                                loading="lazy"
                            />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}