"use client"

import { useRef, useEffect, useMemo } from "react"
import { useQuery } from "@/lib/hooks"
import { ChatMessageList } from "./ChatMessageList"
import { GlassInput } from "./GlassInput"
import { DocumentFilter } from "./DocumentFilter"
import { ShieldCheck } from "lucide-react"

export function ChatInterface() {
    const { history, currentQuery, currentResult, isQuerying, status } = useQuery()
    const scrollRef = useRef<HTMLDivElement>(null)
    const lastHistoryLength = useRef(history.length)
    const lastStatus = useRef(status)

    // Auto-scroll to bottom on new history entries or status changes
    useEffect(() => {
        const shouldScroll = 
            history.length > lastHistoryLength.current || 
            status !== lastStatus.current

        if (shouldScroll && scrollRef.current) {
            setTimeout(() => {
                scrollRef.current?.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: "smooth",
                })
            }, 100) // Small delay ensures DOM paints before scrolling
        }
        lastHistoryLength.current = history.length
        lastStatus.current = status
    }, [history.length, status])

    // FIX: Force chronological order (oldest first, newest at the bottom)
    const messages = useMemo(() => {
        return [...history]
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(entry => ({
                id: entry.id,
                role: "user" as const,
                content: entry.query,
                timestamp: entry.timestamp,
                result: entry.response,
            }))
    }, [history])

    return (
        <div className="flex h-full w-full bg-neutral-50 dark:bg-neutral-900 relative overflow-hidden font-sans">
            <div className="flex flex-col flex-1 min-w-0 relative h-full">
                <div className="relative z-30 shadow-sm shadow-black/5 dark:shadow-none">
                    <DocumentFilter />
                </div>

                <div ref={scrollRef}
                    className="flex-1 overflow-y-auto scrollbar-premium scroll-smooth pb-48 pt-6 px-4 md:px-0"
                    style={{
                        maskImage: 'linear-linear(to bottom, transparent, black 2rem, black 100%)',
                        WebkitMaskImage: 'linear-linear(to bottom, transparent, black 2rem, black 100%)'
                    }}
                >
                    <ChatMessageList
                        messages={messages}
                        currentQuery={currentQuery}
                        currentResult={currentResult}
                        isQuerying={isQuerying}
                        status={status}
                    />
                </div>

                <div className="absolute bottom-0 left-0 right-0 z-20">
                    <div className="h-40 bg-linear-to-t from-neutral-50 via-neutral-50/95 to-transparent dark:from-neutral-950 dark:via-neutral-950/95 pointer-events-none absolute bottom-0 w-full -z-10" />

                    <div className="w-full flex flex-col gap-1 py-1">
                        <div className="w-full mx-auto max-w-3xl relative group">
                            <div className="absolute -inset-1.5 bg-linear-to-r from-indigo-500/10 to-violet-500/10 rounded-3xl blur-md opacity-0 transition duration-700 group-focus-within:opacity-100" />
                            <div className="relative">
                                <GlassInput />
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium tracking-wide text-zinc-400 dark:text-zinc-500">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600/70 dark:text-emerald-400/70" />
                            <span>Contexta retrieves context entirely locally. Your data remains strictly private.</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}