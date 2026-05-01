"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/utils/cn"

interface EmptyStateProps {
    icon: LucideIcon
    title: string
    description?: string
    action?: React.ReactNode
    className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div className={cn(
            "flex flex-col items-center justify-center h-full min-h-[300px] px-6 py-16 text-center animate-in fade-in zoom-in-95 duration-500 ease-out",
            className,
        )}>
            {/* ── Layered Icon Container ───────────────────────────────────── */}
            <div className="relative flex items-center justify-center mb-5">
                {/* Subtle outer glow/ring */}
                <div className="absolute inset-0 rounded-2xl bg-violet-100/50 dark:bg-violet-900/20 blur-xl pointer-events-none" />

                {/* Inner tactile container */}
                <div className="relative flex size-14 items-center justify-center rounded-2xl bg-white dark:bg-neutral-900 ring-1 ring-inset ring-neutral-200/80 dark:ring-white/10 shadow-sm shadow-neutral-200/50 dark:shadow-black/50">
                    <Icon className="size-6 text-neutral-400 dark:text-neutral-500" strokeWidth={1.5} />
                </div>
            </div>

            {/* ── Typography ─────────────────────────────────────────────── */}
            <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-white">
                {title}
            </h3>

            {description && (
                <p className="mt-2 max-w-[280px] text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    {description}
                </p>
            )}

            {/* ── Action Area ────────────────────────────────────────────── */}
            {action && (
                <div className="mt-6">
                    {action}
                </div>
            )}
        </div>
    )
}