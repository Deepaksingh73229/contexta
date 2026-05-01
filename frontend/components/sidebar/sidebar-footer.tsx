"use client"

import { LogOut, Moon, Sun, ChevronRight } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/lib/hooks"
import { cn } from "@/utils/cn"

export function SidebarFooter({ collapsed }: { collapsed: boolean }) {
    const { theme, setTheme } = useTheme()
    const { user, logout } = useAuth()

    return (
        <div className="mt-auto p-3 flex flex-col gap-2 relative z-20">
            {/* User Profile Card */}
            {!collapsed && user && (
                <div className="group flex items-center gap-3 rounded-2xl p-2 transition-all duration-300 hover:bg-white hover:shadow-sm dark:hover:bg-[#1A1A1A] ring-1 ring-transparent hover:ring-neutral-200/60 dark:hover:ring-white/10 cursor-pointer">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-purple-600 shadow-inner text-[13px] font-bold text-white transition-transform duration-300 group-hover:scale-105">
                        {user.username[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-neutral-900 dark:text-white leading-none mb-1">
                            {user.username}
                        </p>
                        <p className="truncate text-[11px] font-medium text-neutral-500 dark:text-neutral-400 capitalize leading-none">
                            {user.role}
                        </p>
                    </div>
                </div>
            )}

            {/* Action Row */}
            <TooltipProvider delayDuration={0}>
                <div className={cn(
                    "flex items-center",
                    collapsed ? "flex-col gap-2" : "justify-between px-1"
                )}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-9 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-white/10 transition-all duration-300 hover:rotate-12"
                                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            >
                                <Sun className="size-4.5 dark:hidden" />
                                <Moon className="hidden size-4.5 dark:block" />
                                <span className="sr-only">Toggle theme</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">Toggle theme</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-9 rounded-xl text-neutral-500 hover:text-rose-600 dark:text-neutral-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all duration-300 hover:-rotate-12"
                                onClick={logout}
                            >
                                <LogOut className="size-4.5" />
                                <span className="sr-only">Log out</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">Log out</TooltipContent>
                    </Tooltip>
                </div>
            </TooltipProvider>
        </div>
    )
}