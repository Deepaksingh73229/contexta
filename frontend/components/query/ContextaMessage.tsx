"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Sparkles, ChevronDown, Clock, FileText, Activity, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { CitationTooltip } from "./CitationTooltip"
import { citationsService } from "@/services"
import type { QueryResponse } from "@/types"
import { cn } from "@/utils/cn"

interface ContextaMessageProps {
    content: string
    result?: QueryResponse
    timestamp: number
    animationDelay?: number
}

export function ContextaMessage({ content, result, timestamp, animationDelay = 0 }: ContextaMessageProps) {
    const [showSources, setShowSources] = useState(false)
    const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

    const confidence = result?.confidence || "MEDIUM"
    const intentType = result?.intent_type || "LOOKUP"
    const elapsedMs = result?.elapsed_ms || 0
    const sources = result?.sources || []
    const gaps = result?.gaps || []

    // Highly refined, high-contrast status styles
    const confidenceStyles = {
        HIGH: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
        MEDIUM: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
        LOW: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
    }

    const intentLabels: Record<string, string> = {
        LOOKUP: "Fact Lookup",
        PROCEDURE: "Procedure",
        DEFINITION: "Definition",
        LIST: "List",
        DATE: "Date Query",
        PERSON: "Person Query",
        COMPARISON: "Comparison",
        GENERAL: "General",
    }

    return (
        <div
            // Smooth physical entrance from the left
            className="group/message-wrapper relative flex justify-start w-full animate-in fade-in slide-in-from-left-4 duration-500 ease-out fill-mode-both hover:z-50 transition-all"
            style={{ animationDelay: `${animationDelay}s` }}
        >
            {/* items-start aligns the avatar at the top of the message block */}
            <div className="flex items-start gap-4 max-w-[95%] sm:max-w-[88%] group/message">
                {/* ── Contexta Core Avatar ───────────────────────────────── */}
                <Sparkles className="size-5 text-yellow-600" />

                {/* ── Main Output Card ───────────────────────────────────── */}
                <div className="w-full flex flex-col gap-2">
                    <div className="w-fit px-5 py-2 flex flex-col rounded-3xl rounded-tl-sm 
                        bg-neutral-100 dark:bg-neutral-800 backdrop-blur-xl
                        border border-zinc-200/60 dark:border-zinc-800/80
                        shadow-sm transition-all duration-300"
                    >
                        {/* ── Answer Payload ─────────────────────────────── */}
                        <div className="answer-prose leading-relaxed text-zinc-800 dark:text-zinc-200 font-medium tracking-tight">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {result?.answer || content}
                            </ReactMarkdown>
                        </div>

                        {/* ── Engineered Gaps Alert ──────────────────── */}
                        {gaps.length > 0 && (
                            <div className="
                                    relative flex items-start gap-3 rounded-xl 
                                    bg-amber-500/5 
                                    border border-amber-500/20 
                                    p-4 overflow-hidden
                                ">
                                {/* Left Accent Bar */}
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-amber-600" />

                                <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
                                        Contextual Gaps Identified
                                    </p>
                                    <p className="text-[13px] text-amber-800 dark:text-amber-300 leading-relaxed font-medium">
                                        {gaps.join(" · ")}
                                    </p>
                                </div>
                            </div>
                        )}

                        <span className="text-xs font-semibold text-neutral-400 dark:text-neutral-500">
                            {time}
                        </span>
                    </div>

                    {/* ── Expandable Citations ───────────────────── */}
                    {sources.length > 0 && (
                        <div className="border-t border-zinc-100 dark:border-zinc-800/50">
                            <button
                                onClick={() => setShowSources(!showSources)}
                                className="group flex items-center gap-2 px-3 py-1.5 -ml-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                            >
                                <FileText className="size-3.5 text-zinc-400 group-hover:text-violet-500 transition-colors" />

                                <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
                                    View {sources.length} Retrieved {sources.length === 1 ? 'Source' : 'Sources'}
                                </span>

                                <ChevronDown className={cn(
                                    "size-3.5 text-zinc-400 transition-transform duration-300",
                                    showSources && "rotate-180"
                                )} />
                            </button>

                            <div className={cn(
                                "grid transition-all duration-300 ease-in-out",
                                showSources ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                            )}>
                                <div className="overflow-visible min-h-0">
                                    <div className="flex flex-wrap gap-2">
                                        {sources.map((source) => (
                                            <CitationTooltip key={`${source.doc_id}-${source.node_id}`} source={source} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}