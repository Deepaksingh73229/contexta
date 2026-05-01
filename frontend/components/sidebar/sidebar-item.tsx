"use client"

import Link from "next/link"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/utils/cn"
import { NavItem } from "@/types/index"

interface SidebarItemProps {
    item: NavItem
    collapsed: boolean
    active: boolean
}

export function SidebarItem({ item, collapsed, active }: SidebarItemProps) {
    const Icon = item.icon

    const content = (
        <Link
            href={item.href}
            className={cn(
                "group relative flex items-center rounded-xl transition-all duration-300 ease-out active:scale-[0.98]",
                collapsed ? "justify-center size-11 mx-auto" : "gap-3 px-3 py-2.5",
                !active && "hover:bg-neutral-100 dark:hover:bg-white/5"
            )}
        >
            {/* Active Glassmorphic Highlight */}
            {active && (
                <div className="absolute inset-0 rounded-xl bg-violet-500/10 dark:bg-violet-500/20 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)] dark:shadow-[inset_0_0_0_1px_rgba(139,92,246,0.3)]" />
            )}

            {/* Icon with bounce & color transition */}
            <Icon className={cn(
                "relative z-10 shrink-0 transition-all duration-300",
                collapsed ? "size-5" : "size-4.5",
                active
                    ? "text-violet-600 dark:text-violet-400"
                    : "text-neutral-500 dark:text-neutral-400 group-hover:scale-110 group-hover:text-neutral-900 dark:group-hover:text-neutral-100"
            )} />

            {!collapsed && (
                <span className={cn(
                    "relative z-10 truncate text-[14px] transition-transform duration-300 group-hover:translate-x-0.5",
                    active ? "font-semibold text-violet-700 dark:text-violet-300" : "font-medium text-neutral-600 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-neutral-100"
                )}>
                    {item.label}
                </span>
            )}

            {/* Badge Indicator */}
            {!collapsed && item.badge ? (
                <div className={cn(
                    "relative z-10 ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold transition-all duration-300",
                    active
                        ? "bg-violet-600 text-white shadow-sm shadow-violet-500/30"
                        : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 group-hover:bg-neutral-300 dark:group-hover:bg-neutral-700"
                )}>
                    {item.badge}
                </div>
            ) : null}

            {/* Collapsed Active Indicator Line */}
            {collapsed && active && (
                <div className="absolute left-0 top-1/2 h-1/2 w-1 -translate-y-1/2 rounded-r-full bg-violet-600 dark:bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
            )}
        </Link>
    )

    if (collapsed) {
        return (
            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                    <TooltipContent side="right" className="flex items-center gap-2 font-medium">
                        {item.label}
                        {item.badge && (
                            <span className="flex h-4 items-center justify-center rounded-full bg-violet-500/20 px-1.5 text-[10px] text-violet-300">
                                {item.badge}
                            </span>
                        )}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )
    }

    return content
}