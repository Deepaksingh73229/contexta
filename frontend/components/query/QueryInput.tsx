"use client"

import { useState, useRef, useEffect } from "react"
import { SendHorizontal, Loader2, LayoutList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useQuery } from "@/lib/hooks"
import { cn } from "@/utils/cn"

export function QueryInput() {
    const { submitQuery, isQuerying, toggleSidebar, setQuery, currentQuery } = useQuery()
    const [localValue, setLocalValue] = useState(currentQuery)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = "auto"
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }, [localValue])

    const handleSubmit = () => {
        if (!localValue.trim() || isQuerying) return
        setQuery(localValue)
        submitQuery(localValue)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }

    return (
        <div className="relative flex items-end gap-3 w-full max-w-4xl mx-auto">

            {/* ── Input Container ────────────────────────────────────────────── */}
            <div className="
                relative flex-1 rounded-2xl 
                bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl 
                ring-1 ring-inset ring-neutral-200/80 dark:ring-white/10 
                shadow-sm shadow-neutral-200/30 dark:shadow-none
                focus-within:ring-2 focus-within:ring-violet-500/50 dark:focus-within:ring-violet-400/50
                focus-within:bg-white dark:focus-within:bg-neutral-900
                transition-all duration-300 ease-out
            ">
                <Textarea
                    ref={textareaRef}
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question about your documents… (Shift+Enter for new line)"
                    className={cn(
                        "min-h-[52px] max-h-40 w-full resize-none bg-transparent",
                        "border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none",
                        "pr-14 pl-4 py-3.5 text-[15px] leading-relaxed text-neutral-900 dark:text-white",
                        "placeholder:text-neutral-400 dark:placeholder:text-neutral-500",
                        "scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800"
                    )}
                    disabled={isQuerying}
                    rows={1}
                />

                {/* Send Button embedded in the input */}
                <div className="absolute bottom-2 right-2">
                    <Button
                        size="icon"
                        className={cn(
                            "h-9 w-9 rounded-xl transition-all duration-200 ease-out active:scale-[0.96]",
                            localValue.trim() && !isQuerying
                                ? "bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-500/20"
                                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-600 dark:hover:text-neutral-300"
                        )}
                        onClick={handleSubmit}
                        disabled={!localValue.trim() || isQuerying}
                        aria-label="Send query"
                    >
                        {isQuerying ? (
                            <Loader2 className="size-4.5 animate-spin text-violet-500" />
                        ) : (
                            <SendHorizontal className={cn(
                                "size-4.5",
                                localValue.trim() && !isQuerying ? "translate-x-0.5" : ""
                            )} />
                        )}
                    </Button>
                </div>
            </div>

            {/* ── Sidebar Toggle ─────────────────────────────────────────────── */}
            <Button
                variant="outline"
                size="icon"
                className="
                    h-[52px] w-[52px] shrink-0 rounded-2xl 
                    bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl
                    border-neutral-200/80 dark:border-white/10
                    text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white
                    hover:bg-white dark:hover:bg-neutral-800
                    shadow-sm shadow-neutral-200/30 dark:shadow-none
                    transition-all duration-300 ease-out active:scale-[0.96]
                "
                onClick={toggleSidebar}
                aria-label="Toggle history sidebar"
                title="Toggle History"
            >
                <LayoutList className="size-5" />
            </Button>
        </div>
    )
}