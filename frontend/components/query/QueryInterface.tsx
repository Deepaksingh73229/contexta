"use client"

import { useState } from "react"
import { useQuery } from "@/lib/hooks"
import { QueryInput } from "./QueryInput"
import { QueryResult } from "./QueryResult"
import { QueryHistory } from "./QueryHistory"
import { DocumentFilter } from "./DocumentFilter"
import { EmptyState } from "@/components/shared/EmptyState"
import { MessageSquare, Sparkles } from "lucide-react"

export function QueryInterface() {
    const { currentResult, isQuerying, status, history, isSidebarOpen } = useQuery()

    return (
        <div className="flex h-full w-full bg-[#FAFAFA] dark:bg-[#0A0A0A] relative overflow-hidden">

            {/* ── Main Area ────────────────────────────────────────────────── */}
            <div className="flex flex-col flex-1 min-w-0 relative z-10">

                {/* Top Filter Bar - Now sits completely flush and sticky */}
                <DocumentFilter />

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800 scroll-smooth pb-32">
                    {status === "idle" && !currentResult ? (
                        <div className="flex h-full flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-700 ease-out">
                            {/* Decorative background glow for empty state */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[500px] bg-violet-400/10 dark:bg-violet-600/10 blur-[100px] rounded-full pointer-events-none" />

                            <div className="relative z-10 bg-white/60 dark:bg-neutral-900/40 backdrop-blur-xl p-8 rounded-3xl border border-neutral-200/60 dark:border-white/10 shadow-xl shadow-neutral-200/30 dark:shadow-black/20 max-w-md text-center">
                                <div className="flex justify-center mb-6">
                                    <div className="relative flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20">
                                        <Sparkles className="size-6 text-white absolute -top-2 -right-2 animate-pulse" />
                                        <MessageSquare className="size-6 text-white" />
                                    </div>
                                </div>
                                <h3 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white mb-2">
                                    Ask your documents anything
                                </h3>
                                <p className="text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                                    Type a question below. Contexta will search all your ingested documents and return a precise, cited answer.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="mx-auto max-w-4xl px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
                            {currentResult && <QueryResult />}
                        </div>
                    )}
                </div>

                {/* Bottom Input Area - Floating Gradient Effect */}
                <div className="
                    absolute bottom-0 left-0 right-0 
                    bg-gradient-to-t from-[#FAFAFA] via-[#FAFAFA]/95 to-transparent 
                    dark:from-[#0A0A0A] dark:via-[#0A0A0A]/95 
                    pt-20 pb-6 px-4 z-20 pointer-events-none
                ">
                    <div className="mx-auto max-w-4xl pointer-events-auto">
                        <QueryInput />
                    </div>
                    {/* Subtle security/privacy text below input */}
                    <div className="text-center mt-3 pointer-events-auto">
                        <p className="text-[11px] font-medium tracking-wide text-neutral-400 dark:text-neutral-500">
                            Contexta retrieves context entirely locally. Your data remains private.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── History Sidebar ──────────────────────────────────────────── */}
            {isSidebarOpen && history.length > 0 && (
                <div className="
                    hidden xl:flex xl:flex-col shrink-0 w-[320px] 
                    border-l border-neutral-200/60 dark:border-white/5 
                    bg-white/50 dark:bg-[#050505]/50 backdrop-blur-2xl
                    shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.05)] dark:shadow-none
                    animate-in slide-in-from-right-8 duration-300 ease-out z-30 relative
                ">
                    {/* Inner subtle highlight line for 3D depth */}
                    <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-white/50 dark:via-white/5 to-transparent pointer-events-none" />
                    <QueryHistory />
                </div>
            )}
        </div>
    )
}