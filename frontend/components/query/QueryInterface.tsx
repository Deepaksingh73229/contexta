// components/query/QueryInterface.tsx
"use client"

import { useState } from "react"
import { useQuery } from "@/lib/hooks"
import { QueryInput } from "./QueryInput"
import { QueryResult } from "./QueryResult"
import { QueryHistory } from "./QueryHistory"
import { DocumentFilter } from "./DocumentFilter"
import { EmptyState } from "@/components/shared/EmptyState"
import { MessageSquare } from "lucide-react"

export function QueryInterface() {
    const { currentResult, isQuerying, queryStatus, history, isSidebarOpen } = useQuery()

    return (
        <div className="flex h-full">
            {/* Main area */}
            <div className="flex flex-1 flex-col min-w-0">
                {/* Document filter bar */}
                <DocumentFilter />

                {/* Content */}
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                    {queryStatus === "idle" && !currentResult ? (
                        <EmptyState
                            icon={MessageSquare}
                            title="Ask your documents anything"
                            description="Type a question below. Contexta will search all your ingested documents and return a precise, cited answer."
                        />
                    ) : (
                        <div className="mx-auto max-w-3xl px-4 py-6">
                            {currentResult && <QueryResult />}
                        </div>
                    )}
                </div>

                {/* Input */}
                <div className="border-t border-border bg-background px-4 py-4">
                    <div className="mx-auto max-w-3xl">
                        <QueryInput />
                    </div>
                </div>
            </div>

            {/* History sidebar */}
            {isSidebarOpen && history.length > 0 && (
                <div className="hidden w-72 border-l border-border xl:flex xl:flex-col">
                    <QueryHistory />
                </div>
            )}
        </div>
    )
}