import Image from "next/image"

import hero from "@/public/undraw5.svg"
import type { QueryResponse } from "@/types"
import { UserMessage } from "./UserMessage"
import { ContextaMessage } from "./ContextaMessage"
import { LoadingSkeleton } from "./LoadingSkeleton"

interface ChatMessageListProps {
    messages: {
        id: string
        role: "user"
        content: string
        timestamp: number
        result?: QueryResponse
    }[]
    currentQuery: string
    currentResult: QueryResponse | null
    isQuerying: boolean
    status: "idle" | "loading" | "success" | "failed"
}

export function ChatMessageList({
    messages,
    currentQuery,
    currentResult,
    isQuerying,
    status
}: ChatMessageListProps) {
    const hasMessages = messages.length > 0
    const showLoading = isQuerying && status === "loading" && currentQuery
    const showCurrentResult = status === "success" && currentResult && !messages.find(m => m.content === currentQuery)

    // ── Premium Empty State (Zero State) ────────────────────────────────────────
    if (!hasMessages && !showLoading && !showCurrentResult) {
        return (
            <div className="flex h-full flex-col gap-5 items-center justify-center">
                <Image
                    src={hero}
                    alt="hero-img"
                    loading="lazy"
                    className="w-120 opacity-80"
                />

                <span className="text-neutral-300 dark:text-neutral-600 text-5xl font-black">
                    Start searching in the local databse
                </span>
            </div>
        )
    }

    // ── Active Chat State ───────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-10 px-4 max-w-4xl mx-auto w-full">
            {/* Render history messages */}
            {messages.map((message, index) => (
                <div key={message.id} className="group flex flex-col gap-4 animate-in fade-in duration-500">
                    {/* User query */}
                    <UserMessage
                        content={message.content}
                        timestamp={message.timestamp}
                        animationDelay={0}
                    />

                    {/* Contexta response */}
                    {message.result && (
                        <div className="pl-4 sm:pl-6 border-l-2 border-transparent group-hover:border-violet-100 dark:group-hover:border-violet-900/30 transition-colors duration-500">
                            <ContextaMessage
                                content={message.result.answer}
                                result={message.result}
                                timestamp={message.timestamp}
                                animationDelay={0.1}
                            />
                        </div>
                    )}
                </div>
            ))}

            {/* Current in-flight query */}
            {showLoading && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <UserMessage
                        content={currentQuery}
                        timestamp={Date.now()}
                        animationDelay={0}
                    />

                    <div className="pl-4 sm:pl-6">
                        <LoadingSkeleton />
                    </div>
                </div>
            )}

            {/* Current result (not yet in history) */}
            {showCurrentResult && currentResult && (
                <div className="flex flex-col gap-4 animate-in fade-in duration-500">
                    <UserMessage
                        content={currentQuery}
                        timestamp={Date.now() - 1000}
                        animationDelay={0}
                    />

                    <ContextaMessage
                        content={currentResult.answer}
                        result={currentResult}
                        timestamp={Date.now()}
                        animationDelay={0.1}
                    />
                </div>
            )}
        </div>
    )
}