"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ChevronDown, ChevronRight, FileText, Cpu, Clock, AlertTriangle, Sparkles, Terminal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CitationCard } from "./CitationCard"
import { useQuery } from "@/lib/hooks"
import {
    CONFIDENCE_COLORS, CONFIDENCE_BG, CONFIDENCE_LABELS,
    INTENT_LABELS, INTENT_ICONS, formatQueryTime,
} from "@/utils"
import { cn } from "@/utils/cn"

export function QueryResult() {
    const { currentResult, currentQuery } = useQuery()
    const [showThinking, setShowThinking] = useState(false)

    if (!currentResult) return null

    const {
        answer, confidence, intent_type, search_focus,
        gaps, sources, thinking, elapsed_ms,
    } = currentResult

    return (
        <div className="space-y-10 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 ease-out pb-8">

            {/* ── User Query Header ────────────────────────────────────────── */}
            <div className="flex items-start gap-4 px-2 sm:px-4">
                <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-800 text-[13px] font-bold text-neutral-600 dark:text-neutral-300 shadow-inner">
                    You
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold leading-snug tracking-tight text-neutral-900 dark:text-white pt-1">
                    {currentQuery}
                </h2>
            </div>

            {/* ── AI Response Container ────────────────────────────────────── */}
            <div className="relative">

                {/* AI Avatar Badge */}
                <div className="absolute -top-4 -left-2 sm:-left-5 size-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/30 z-10 border-2 border-[#FAFAFA] dark:border-[#0A0A0A]">
                    <Sparkles className="size-5" />
                </div>

                <div className={cn(
                    "relative rounded-2xl sm:rounded-[24px] p-6 sm:p-8 space-y-8",
                    "bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl",
                    "ring-1 ring-inset ring-neutral-200/80 dark:ring-white/10 shadow-sm",
                    CONFIDENCE_BG[confidence], // Preserving original dynamic background utility
                )}>

                    {/* Meta Info Row */}
                    <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-neutral-200/60 dark:border-white/10">
                        <Badge variant="outline" className={cn(
                            "px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border-0 shadow-sm",
                            CONFIDENCE_COLORS[confidence]
                        )}>
                            {CONFIDENCE_LABELS[confidence]}
                        </Badge>
                        <Badge variant="secondary" className="px-2.5 py-1 gap-1.5 text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 border-0">
                            <span className="text-neutral-400">{INTENT_ICONS[intent_type]}</span>
                            {INTENT_LABELS[intent_type]}
                        </Badge>
                        <Badge variant="secondary" className="ml-auto px-2.5 py-1 gap-1.5 text-[11px] font-medium font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-100 border-0">
                            <Clock className="size-3" />
                            {formatQueryTime(elapsed_ms)}
                        </Badge>
                    </div>

                    {/* Answer Prose / Markdown */}
                    <div className="answer-prose text-[15px] sm:text-[16px] leading-relaxed text-neutral-800 dark:text-neutral-200">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                    </div>

                    {/* Knowledge Gaps Alert */}
                    {gaps.length > 0 && (
                        <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3.5">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            <div className="text-[13px] text-amber-900 dark:text-amber-200 leading-relaxed">
                                <span className="font-bold tracking-wide uppercase text-[11px] mr-2 opacity-80">Coverage Gaps</span>
                                {gaps.join(" · ")}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Extracted Sources ────────────────────────────────────────── */}
            {sources.length > 0 && (
                <div className="space-y-3 px-2 sm:px-4">
                    <div className="flex items-center gap-2">
                        <FileText className="size-4 text-neutral-400" />
                        <h3 className="text-[12px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">
                            Retrieved Sources ({sources.length})
                        </h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {sources.map((source) => (
                            <CitationCard key={`${source.doc_id}-${source.node_id}`} source={source} />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Agent Reasoning Terminal ─────────────────────────────────── */}
            {thinking && (
                <div className="px-2 sm:px-4 pt-4">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2 rounded-full border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-[13px] font-medium text-neutral-600 dark:text-neutral-300 transition-all shadow-sm"
                        onClick={() => setShowThinking((v) => !v)}
                    >
                        <Cpu className="size-4 text-violet-500" />
                        Agent Trace Log
                        {showThinking ? <ChevronDown className="size-3.5 ml-1 text-neutral-400" /> : <ChevronRight className="size-3.5 ml-1 text-neutral-400" />}
                    </Button>

                    {showThinking && (
                        <div className="mt-4 overflow-hidden rounded-2xl bg-[#050505] ring-1 ring-inset ring-neutral-800 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                            {/* Fake Mac Window Header */}
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 border-b border-neutral-800">
                                <div className="flex gap-1.5">
                                    <div className="size-2.5 rounded-full bg-red-500/80" />
                                    <div className="size-2.5 rounded-full bg-amber-500/80" />
                                    <div className="size-2.5 rounded-full bg-green-500/80" />
                                </div>
                                <div className="ml-2 flex items-center gap-1.5 text-neutral-500">
                                    <Terminal className="size-3.5" />
                                    <span className="text-[11px] font-mono tracking-widest">contexta-rag-engine.log</span>
                                </div>
                            </div>
                            {/* Log Output */}
                            <ScrollArea className="h-64 sm:h-80 w-full">
                                <pre className="p-4 sm:p-5 text-[12px] sm:text-[13px] leading-relaxed text-emerald-400/90 whitespace-pre-wrap font-mono selection:bg-emerald-500/30">
                                    {thinking}
                                </pre>
                            </ScrollArea>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}