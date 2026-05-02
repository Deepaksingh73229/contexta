"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { SendHorizontal, Loader2, Command } from "lucide-react"
import { useQuery } from "@/lib/hooks"
import { cn } from "@/utils/cn"

export function GlassInput() {
    const { submitQuery, isQuerying } = useQuery()
    const [value, setValue] = useState("")
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [isFocused, setIsFocused] = useState(false)

    // Auto-resize textarea smoothly
    useEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = "auto"
        const newHeight = Math.min(el.scrollHeight, 160) // max 160px (~5 lines)
        el.style.height = `${Math.max(newHeight, 56)}px`
    }, [value])

    const handleSubmit = useCallback(() => {
        const trimmed = value.trim()
        if (!trimmed || isQuerying) return
        submitQuery(trimmed)
        setValue("")
        // Reset height
        if (textareaRef.current) {
            textareaRef.current.style.height = "56px"
        }
    }, [value, isQuerying, submitQuery])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }

    const charCount = value.length
    const isNearLimit = charCount > 1800

    return (
        <div
            className={cn(
                "relative flex items-end gap-3 rounded-3xl p-2 transition-all duration-500 ease-out",
                // True Glassmorphism base
                "bg-white/70 dark:bg-[#121214]/60 backdrop-blur-xl",
                "border border-zinc-200/50 dark:border-zinc-800/80",
                "shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]",
                // Elevated focus state
                isFocused && "border-violet-300 dark:border-violet-500/50 shadow-[0_8px_30px_rgb(139,92,246,0.12)] dark:shadow-[0_8px_30px_rgb(139,92,246,0.15)] -translate-y-0.5"
            )}
        >
            {/* Top inner glare line for 3D realism */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent rounded-t-3xl pointer-events-none" />

            {/* Textarea */}
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Ask anything about your documents..."
                maxLength={2000}
                disabled={isQuerying}
                rows={1}
                className={cn(
                    "w-full resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none outline-none",
                    "px-5 py-4 text-[16px] leading-relaxed text-zinc-900 dark:text-zinc-100 font-medium tracking-tight",
                    "placeholder:text-zinc-400 dark:placeholder:text-zinc-500 placeholder:font-normal",
                    "min-h-[56px] max-h-[160px]",
                    "scrollbar-premium",
                    "disabled:opacity-50 transition-opacity"
                )}
            />

            {/* Right side controls */}
            <div className="flex flex-col items-end gap-2 shrink-0 pb-1.5 pr-1.5">

                {/* Character counter / Hint */}
                <div className="flex items-center gap-1.5 h-4">
                    {charCount > 0 ? (
                        <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest tabular-nums transition-colors",
                            isNearLimit
                                ? "text-amber-500 dark:text-amber-400"
                                : "text-zinc-400 dark:text-zinc-500"
                        )}>
                            {charCount}/2000
                        </span>
                    ) : (
                        // Show "Enter to send" hint when empty and focused
                        <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 transition-opacity duration-300 flex items-center gap-1",
                            isFocused ? "opacity-100" : "opacity-0"
                        )}>
                            <Command className="size-3" /> Enter
                        </span>
                    )}
                </div>

                {/* Premium Send Button */}
                <button
                    onClick={handleSubmit}
                    disabled={!value.trim() || isQuerying}
                    className={cn(
                        "flex items-center justify-center size-11 rounded-2xl transition-all duration-300 ease-out overflow-hidden relative group",
                        "disabled:opacity-40 disabled:cursor-not-allowed",
                        value.trim() && !isQuerying
                            ? "shadow-md hover:shadow-xl hover:scale-105 active:scale-95"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600"
                    )}
                    aria-label={isQuerying ? "Processing..." : "Send message"}
                >
                    <div className="relative z-10">
                        {isQuerying ? (
                            <Loader2 className="size-5 animate-spin text-violet-500 dark:text-violet-400" />
                        ) : (
                            <SendHorizontal className={cn(
                                "size-5 transition-transform duration-300 cursor-pointer",
                                value.trim() ? "text-violet-700 -translate-x-0.5 group-hover:translate-x-0" : "translate-x-0"
                            )} />
                        )}
                    </div>
                </button>
            </div>
        </div>
    )
}