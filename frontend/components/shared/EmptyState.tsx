// components/shared/EmptyState.tsx
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
            "flex flex-col items-center justify-center h-full min-h-64 px-6 py-16 text-center",
            className,
        )}>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Icon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{title}</p>
            {description && (
                <p className="mt-1.5 max-w-xs text-xs text-muted-foreground leading-relaxed">
                    {description}
                </p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    )
}