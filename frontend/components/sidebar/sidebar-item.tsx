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
                "group relative flex items-center rounded-xl overflow-hidden",
                "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "active:scale-[0.96]",
                collapsed
                    ? "justify-center size-11 mx-auto"
                    : "gap-3 px-3 py-2.5",

                active
                    ? "bg-violet-50/80 dark:bg-violet-500/10"
                    : "hover:bg-neutral-100/80 dark:hover:bg-white/5"
            )}
        >
            {/* 🔥 Animated Active Background Glow */}
            <div
                className={cn(
                    "absolute inset-0 rounded-xl pointer-events-none",
                    "transition-opacity duration-300",
                    active
                        ? "opacity-100"
                        : "opacity-0"
                )}
                style={{
                    boxShadow: active
                        ? "inset 0 0 0 1px rgba(139,92,246,0.15)"
                        : "none"
                }}
            />

            {/* 🔥 Smooth Left Border (slide + grow) */}
            <div
                className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full",
                    "h-[65%] w-[3px]",
                    "bg-violet-600 dark:bg-violet-400",
                    "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    active
                        ? "opacity-100 scale-y-100 translate-x-0"
                        : "opacity-0 scale-y-0 -translate-x-1"
                )}
            />

            {/* Icon */}
            <Icon
                className={cn(
                    "relative z-10 shrink-0 transition-all duration-200",
                    collapsed ? "size-5" : "size-5",
                    active
                        ? "text-violet-600 dark:text-violet-400"
                        : "text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white"
                )}
            />

            {/* Label */}
            {!collapsed && (
                <span
                    className={cn(
                        "relative z-10 text-sm truncate",
                        "transition-all duration-200",
                        active
                            ? "font-semibold text-violet-700 dark:text-violet-300"
                            : "font-medium text-neutral-600 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-white"
                    )}
                >
                    {item.label}
                </span>
            )}

            {/* Badge */}
            {!collapsed && item.badge && (
                <div
                    className={cn(
                        "relative z-10 ml-auto text-xs px-1.5 py-0.5 rounded-full",
                        "transition-all duration-200",
                        active
                            ? "bg-violet-600 text-white shadow-sm"
                            : "bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                    )}
                >
                    {item.badge}
                </div>
            )}
        </Link>
    )

    if (collapsed) {
        return (
            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                    <TooltipContent side="right">
                        {item.label}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )
    }

    return content
}