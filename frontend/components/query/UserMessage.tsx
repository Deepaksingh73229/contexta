import { User } from "lucide-react"

interface UserMessageProps {
    content: string
    timestamp: number
    animationDelay?: number
}

export function UserMessage({ content, timestamp, animationDelay = 0 }: UserMessageProps) {
    const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

    return (
        <div
            // Premium enter animation: fades and slightly slides in from the right
            className="flex justify-end w-full animate-in fade-in slide-in-from-right-4 duration-500 fill-mode-both"
            style={{ animationDelay: `${animationDelay}s` }}
        >
            {/* items-end aligns the bottom of the bubble perfectly with the avatar */}
            <div className="flex items-end gap-3 max-w-[85%] sm:max-w-[75%] group">

                {/* ── High-Contrast Message Bubble ───────────────────────── */}
                <div className="flex flex-col px-5 py-2 rounded-2xl rounded-br-sm bg-neutral-200 dark:bg-neutral-800 
                    text-neutral-800 dark:text-neutral-200
                    shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(255,255,255,0.05)]
                    transition-transform duration-300 ease-out"
                >

                    <p className="leading-relaxed relative font-medium tracking-tight">
                        {content}
                    </p>

                    <span className="text-xs font-semibold text-end text-neutral-400 dark:text-neutral-500">
                        {time}
                    </span>
                </div>

                {/* ── Monogram Avatar ────────────────────────────────────── */}
                <div className="
                    flex size-8 shrink-0 items-center justify-center rounded-full 
                    bg-white dark:bg-neutral-900 
                    text-neutral-600 dark:text-neutral-400
                    border border-neutral-200/80 dark:border-neutral-800
                    shadow-sm
                    ring-4 ring-[#FAFAFA] dark:ring-[#0A0A0C]
                    z-10 transition-transform duration-300 group-hover:scale-105
                ">
                    <User className="size-4" />
                </div>

            </div>
        </div>
    )
}