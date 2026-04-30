// components/query/QueryInput.tsx
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
        <div className="relative flex items-end gap-2">
            <div className="relative flex-1">
                <Textarea
                    ref={textareaRef}
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question about your documents… (Enter to send, Shift+Enter for new line)"
                    className={cn(
                        "min-h-[44px] max-h-40 resize-none rounded-xl pr-12 py-3 text-sm",
                        "scrollbar-thin transition-shadow",
                        "focus-visible:ring-[hsl(var(--brand))]",
                    )}
                    disabled={isQuerying}
                    rows={1}
                />
                <Button
                    size="icon"
                    className={cn(
                        "absolute bottom-2 right-2 h-7 w-7 rounded-lg",
                        "bg-[hsl(var(--brand))] hover:bg-[hsl(var(--brand))] hover:opacity-90",
                    )}
                    onClick={handleSubmit}
                    disabled={!localValue.trim() || isQuerying}
                    aria-label="Send query"
                >
                    {isQuerying ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <SendHorizontal className="h-3.5 w-3.5" />
                    )}
                </Button>
            </div>

            <Button
                variant="outline"
                size="icon"
                className="h-[44px] w-[44px] shrink-0 rounded-xl"
                onClick={toggleSidebar}
                aria-label="Toggle history"
            >
                <LayoutList className="h-4 w-4" />
            </Button>
        </div>
    )
}