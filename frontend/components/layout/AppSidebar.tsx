"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    MessagesSquare, Upload, FileText, Users, ClipboardList, LogOut, Moon, Sun, ChevronLeft, Database,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuth } from "@/lib/hooks"
import { usePermission } from "@/lib/hooks"
import { useAppSelector } from "@/store/hooks"
import { selectActiveTasks } from "@/store/slices/tasksSlice"
import { cn } from "@/utils/cn"

interface NavItem {
    href: string
    label: string
    icon: React.ElementType
    permission?: string
    badge?: number
}

interface AppSidebarProps {
    collapsed: boolean
    onToggle: () => void
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
    const pathname = usePathname()
    const { theme, setTheme } = useTheme()
    const { user, logout } = useAuth()
    const { canUpload, canViewDocs, canManageUsers, canViewAudit, canQuery } = usePermission()
    const activeTasks = useAppSelector(selectActiveTasks)

    const navItems: NavItem[] = [
        {
            href: "/dashboard",
            label: "Ask Contexta",
            icon: MessagesSquare
        },

        canUpload && {
            href: "/upload",
            label: "Upload",
            icon: Upload,
            badge: activeTasks.length || undefined
        },

        canViewDocs && { 
            href: "/documents", 
            label: "Documents", 
            icon: FileText 
        },
    ].filter(Boolean) as NavItem[]

    const adminItems: NavItem[] = [
        canManageUsers && { href: "/admin/users", label: "Users", icon: Users },
        canViewAudit && { href: "/admin/audit", label: "Audit Log", icon: ClipboardList },
    ].filter(Boolean) as NavItem[]

    const isActive = (href: string) =>
        href === "/dashboard" ? pathname === href : pathname.startsWith(href)

    return (
        <TooltipProvider delayDuration={0}>
            <aside
                className={cn(
                    "flex h-full flex-col bg-transparent transition-all duration-300 ease-out z-10",
                    collapsed ? "w-20" : "w-64", // Slightly wider for a premium feel
                )}
            >
                {/* ── Logo Area ───────────────────────────────────────────── */}
                <div className={cn(
                    "flex h-16 items-center px-4 mb-2",
                    collapsed ? "justify-center px-0" : "justify-between"
                )}>
                    {!collapsed && (
                        <Link href="/dashboard" className="flex items-center gap-2.5 group">
                            <div className="flex items-center justify-center size-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/20 group-hover:shadow-violet-500/40 transition-all duration-300">
                                <Database className="size-4.5 text-white" />
                            </div>

                            <span className="font-bold text-lg tracking-tight text-neutral-900 dark:text-white">
                                Contexta
                            </span>
                        </Link>
                    )}

                    {collapsed && (
                        <Link href="/dashboard" className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/20 hover:shadow-violet-500/40 transition-all duration-300">
                            <Database className="size-5 text-white" />
                        </Link>
                    )}

                    {!collapsed && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 rounded-lg transition-colors"
                            onClick={onToggle}
                        >
                            <ChevronLeft className="size-4.5" />
                        </Button>
                    )}
                </div>

                {/* ── Navigation ──────────────────────────────────────────── */}
                <ScrollArea className="flex-1 px-3">
                    <nav className="space-y-1 pb-4">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.href}
                                item={item}
                                collapsed={collapsed}
                                active={isActive(item.href)}
                            />
                        ))}

                        {adminItems.length > 0 && (
                            <div className="mt-6 mb-2">
                                {!collapsed ? (
                                    <p className="px-3 text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-2">
                                        Administration
                                    </p>
                                ) : (
                                    <div className="flex justify-center mb-2">
                                        <div className="h-px w-6 bg-neutral-200 dark:bg-neutral-800" />
                                    </div>
                                )}
                                <div className="space-y-1">
                                    {adminItems.map((item) => (
                                        <NavLink
                                            key={item.href}
                                            item={item}
                                            collapsed={collapsed}
                                            active={isActive(item.href)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </nav>
                </ScrollArea>

                {/* ── Footer ──────────────────────────────────────────────── */}
                <div className="p-3 mt-auto space-y-2">

                    {/* User Profile */}
                    {!collapsed && user && (
                        <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-neutral-200/50 dark:hover:bg-neutral-800/40 group cursor-pointer">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-neutral-800 to-black dark:from-neutral-200 dark:to-white text-[13px] font-bold text-white dark:text-black shadow-sm">
                                {user.username[0].toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-semibold text-neutral-900 dark:text-white leading-none mb-1">{user.username}</p>
                                <p className="truncate text-[11px] font-medium text-neutral-500 dark:text-neutral-400 capitalize leading-none">{user.role}</p>
                            </div>
                        </div>
                    )}

                    {/* Action Row */}
                    <div className={cn(
                        "flex items-center",
                        collapsed ? "flex-col gap-2" : "gap-1 px-1"
                    )}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-9 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors"
                                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                                >
                                    <Sun className="size-4.5 dark:hidden" />
                                    <Moon className="hidden size-4.5 dark:block" />
                                    <span className="sr-only">Toggle theme</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Toggle theme</TooltipContent>
                        </Tooltip>

                        {!collapsed && <div className="flex-1" />}

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-9 rounded-xl text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                    onClick={logout}
                                    aria-label="Log out"
                                >
                                    <LogOut className="size-4.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Log out</TooltipContent>
                        </Tooltip>

                        {collapsed && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-9 rounded-xl mt-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors"
                                        onClick={onToggle}
                                    >
                                        <ChevronLeft className="size-4.5 rotate-180" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right">Expand sidebar</TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                </div>
            </aside>
        </TooltipProvider>
    )
}

// ── NavLink sub-component ─────────────────────────────────────

interface NavLinkProps {
    item: NavItem
    collapsed: boolean
    active: boolean
}

function NavLink({ item, collapsed, active }: NavLinkProps) {
    const Icon = item.icon

    const content = (
        <Link
            href={item.href}
            className={cn(
                "group flex items-center rounded-xl transition-all duration-200 ease-out relative",
                collapsed ? "justify-center size-12 mx-auto" : "gap-3 px-3 py-2.5",
                active
                    ? "bg-white dark:bg-[#1A1A1A] text-violet-600 dark:text-violet-400 shadow-sm ring-1 ring-inset ring-neutral-200/60 dark:ring-white/10"
                    : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/40 hover:text-neutral-900 dark:hover:text-neutral-100"
            )}
        >
            <Icon className={cn(
                "shrink-0 transition-colors duration-200",
                collapsed ? "size-5" : "size-4.5",
                active && "text-violet-600 dark:text-violet-400"
            )} />

            {!collapsed && (
                <span className={cn(
                    "truncate text-[14px]",
                    active ? "font-semibold" : "font-medium"
                )}>
                    {item.label}
                </span>
            )}

            {!collapsed && item.badge ? (
                <div className={cn(
                    "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold transition-colors",
                    active
                        ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                        : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                )}>
                    {item.badge}
                </div>
            ) : null}

            {/* Active Indicator line for collapsed state */}
            {collapsed && active && (
                <div className="absolute left-0 top-1/2 h-1/2 w-1 -translate-y-1/2 rounded-r-full bg-violet-600 dark:bg-violet-400" />
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
                        {item.badge ? (
                            <span className="flex h-4 items-center justify-center rounded-full bg-violet-500/20 px-1.5 text-[10px] text-violet-300">
                                {item.badge}
                            </span>
                        ) : null}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )
    }

    return content
}