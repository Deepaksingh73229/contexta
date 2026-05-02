"use client"

import { useState } from "react"
import { Cpu, ChevronDown, Terminal } from "lucide-react"
import { cn } from "@/utils/cn"

interface ThinkingTraceProps {
    thinking: string
}

export function ThinkingTrace({ thinking }: ThinkingTraceProps) {
    const [isOpen, setIsOpen] = useState(false)

    if (!thinking) return null

    return (
        <div className="mt-3 w-full">
            {/* ── Toggle Button ────────────────────────────────────────────── */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="group flex items-center gap-2 px-3 py-1.5 -ml-3 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors duration-200"
            >
                <Cpu className="size-3.5 text-zinc-400 group-hover:text-violet-500 transition-colors" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
                    Pipeline Trace
                </span>
                <ChevronDown className={cn(
                    "size-3.5 text-zinc-400 transition-transform duration-300 ease-in-out",
                    isOpen && "rotate-180"
                )} />
            </button>

            {/* ── Smooth Expandable Terminal ───────────────────────────────── */}
            <div className={cn(
                "grid transition-all duration-300 ease-in-out",
                isOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
            )}>
                <div className="overflow-hidden">

                    {/* Terminal Window (Always dark for premium code feel) */}
                    <div className="relative rounded-xl overflow-hidden bg-[#0A0A0C] border border-zinc-800 shadow-2xl shadow-black/20">

                        {/* Subtle top glare */}
                        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

                        {/* Terminal Header */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-[#121214] border-b border-zinc-800/80">
                            <div className="flex gap-1.5">
                                <div className="size-2.5 rounded-full bg-zinc-700/50 border border-zinc-600/50" />
                                <div className="size-2.5 rounded-full bg-zinc-700/50 border border-zinc-600/50" />
                                <div className="size-2.5 rounded-full bg-zinc-700/50 border border-zinc-600/50" />
                            </div>

                            <div className="flex items-center gap-1.5 text-zinc-500 absolute left-1/2 -translate-x-1/2">
                                <Terminal className="size-3" />
                                <span className="text-[10px] font-mono font-medium tracking-widest uppercase">
                                    retrieval.log
                                </span>
                            </div>

                            <div className="size-4" /> {/* Spacer for centering */}
                        </div>

                        {/* Terminal Content */}
                        <div className="p-4 max-h-72 overflow-y-auto scrollbar-premium">
                            <pre className="text-[12px] leading-relaxed text-zinc-300/90 whitespace-pre-wrap font-mono tracking-tight">
                                {thinking}
                            </pre>
                        </div>

                        {/* Bottom fade gradient to indicate more scrolling */}
                        <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-[#0A0A0C] to-transparent pointer-events-none" />
                    </div>
                </div>
            </div>
        </div>
    )
}