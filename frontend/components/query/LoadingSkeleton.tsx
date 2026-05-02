"use client"

import { Sparkles, Activity } from "lucide-react"

export function LoadingSkeleton() {
    return (
        <div className="flex justify-start w-full animate-in fade-in duration-500 ease-out">
            <div className="flex items-start gap-4 max-w-[95%] sm:max-w-[88%]">

                {/* ── Contexta Core Avatar (Pulsing) ─────────────────────── */}
                <div className="
                    relative flex size-8 shrink-0 items-center justify-center rounded-xl 
                    bg-gradient-to-b from-violet-500/50 to-fuchsia-600/50 
                    text-white/80
                    ring-4 ring-[#FAFAFA] dark:ring-[#0A0A0C]
                    mt-1 z-10
                ">
                    <Sparkles className="size-4 animate-pulse" />
                    {/* Continuous ping for "thinking" state */}
                    <div className="absolute inset-0 rounded-xl ring-2 ring-violet-400/50 animate-ping opacity-30" />
                </div>

                {/* ── Skeleton Card ──────────────────────────────────────── */}
                <div className="flex-1 min-w-0">
                    <div className="
                        relative rounded-2xl rounded-tl-sm overflow-hidden
                        bg-white/40 dark:bg-[#121214]/40 backdrop-blur-md
                        border border-zinc-200/40 dark:border-zinc-800/40
                        shadow-sm
                    ">
                        {/* Premium ultra-thin top glow line (Dimmed for loading) */}
                        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/30 to-transparent animate-pulse" />

                        {/* ── Telemetry Header Skeleton ───────────────────── */}
                        <div className="px-5 py-3 border-b border-zinc-100/50 dark:border-zinc-800/50 bg-zinc-50/30 dark:bg-zinc-900/10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Activity className="size-3.5 text-zinc-400 dark:text-zinc-600 animate-pulse" />
                                <div className="h-3 w-16 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                                <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded-sm animate-pulse" />
                            </div>
                            <div className="flex gap-2">
                                <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                                <div className="h-3 w-12 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                            </div>
                        </div>

                        {/* ── Content Skeleton Lines ──────────────────────── */}
                        <div className="p-5 sm:p-6 space-y-6">
                            <div className="space-y-3">
                                <div className="h-3.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-md animate-pulse" />
                                <div className="h-3.5 w-[92%] bg-zinc-200 dark:bg-zinc-800 rounded-md animate-pulse delay-75" />
                                <div className="h-3.5 w-[85%] bg-zinc-200 dark:bg-zinc-800 rounded-md animate-pulse delay-100" />
                                <div className="h-3.5 w-[60%] bg-zinc-200 dark:bg-zinc-800 rounded-md animate-pulse delay-150" />
                            </div>

                            {/* ── Sources Skeleton Blocks ───────────────────── */}
                            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/50 flex gap-2">
                                <div className="h-8 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
                                <div className="h-8 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse delay-75" />
                            </div>

                            {/* ── Dynamic Typing/Status Indicator ─────────── */}
                            <div className="flex items-center gap-3 pt-2">
                                <div className="flex gap-1.5 items-center">
                                    <span className="size-1.5 rounded-full bg-violet-500/80 animate-[bounce_1.4s_infinite_0ms]" />
                                    <span className="size-1.5 rounded-full bg-violet-500/80 animate-[bounce_1.4s_infinite_200ms]" />
                                    <span className="size-1.5 rounded-full bg-violet-500/80 animate-[bounce_1.4s_infinite_400ms]" />
                                </div>
                                <span className="text-[11px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-semibold animate-pulse">
                                    Querying Local Vectors
                                </span>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
}