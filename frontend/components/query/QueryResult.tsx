// components/query/QueryResult.tsx
"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ChevronDown, ChevronRight, FileText, Cpu, Clock, AlertTriangle } from "lucide-react"
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
        <div className="space-y-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            {/* Query echo */}
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand-muted))] text-xs font-bold text-[hsl(var(--brand))]">
                    Q
                </div>
                <p className="pt-1 text-sm font-medium">{currentQuery}</p>
            </div>

            {/* Answer card */}
            <div className={cn(
                "rounded-xl border p-5 space-y-4",
                CONFIDENCE_BG[confidence],
            )}>
                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn("gap-1 text-xs", CONFIDENCE_COLORS[confidence])}>
                        {CONFIDENCE_LABELS[confidence]}
                    </Badge>
                    <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                        {INTENT_ICONS[intent_type]} {INTENT_LABELS[intent_type]}
                    </Badge>
                    <Badge variant="outline" className="ml-auto gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatQueryTime(elapsed_ms)}
                    </Badge>
                </div>

                {/* Answer body */}
                <div className="answer-prose text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                </div>

                {/* Gaps */}
                {gaps.length > 0 && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="text-xs text-amber-700 dark:text-amber-300">
                            <span className="font-medium">Coverage gaps: </span>
                            {gaps.join(" · ")}
                        </div>
                    </div>
                )}
            </div>

            {/* Sources */}
            {sources.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Sources ({sources.length})
                        </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {sources.map((source) => (
                            <CitationCard key={`${source.doc_id}-${source.node_id}`} source={source} />
                        ))}
                    </div>
                </div>
            )}

            {/* Thinking / agent trace */}
            {thinking && (
                <div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground px-2"
                        onClick={() => setShowThinking((v) => !v)}
                    >
                        <Cpu className="h-3.5 w-3.5" />
                        Agent reasoning
                        {showThinking ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </Button>
                    {showThinking && (
                        <ScrollArea className="mt-2 h-48">
                            <pre className="rounded-lg border border-border bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
                                {thinking}
                            </pre>
                        </ScrollArea>
                    )}
                </div>
            )}
        </div>
    )
}