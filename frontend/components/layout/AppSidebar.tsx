// components/layout/AppSidebar.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    MessageSquare, Upload, FileText, Users, ClipboardList,
    Settings, LogOut, Moon, Sun, ChevronLeft, Database,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
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
        { href: "/dashboard", label: "Ask Anything", icon: MessageSquare },
        canUpload && { href: "/upload", label: "Upload", icon: Upload, badge: activeTasks.length || undefined },
        canViewDocs && { href: "/documents", label: "Documents", icon: FileText },
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
                    "flex h-full flex-col border-r border-border bg-card transition-all duration-200",
                    collapsed ? "w-14" : "w-56",
                )}
            >
                {/* Logo */}
                <div className={cn(
                    "flex h-14 items-center border-b border-border px-3",
                    collapsed ? "justify-center" : "justify-between px-4",
                )}>
                    {!collapsed && (
                        <Link href="/dashboard" className="flex items-center gap-2">
                            <Database className="h-5 w-5 text-[hsl(var(--brand))]" />
                            <span className="font-semibold tracking-tight">Contexta</span>
                        </Link>
                    )}
                    {collapsed && (
                        <Database className="h-5 w-5 text-[hsl(var(--brand))]" />
                    )}
                    {!collapsed && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {/* Nav */}
                <ScrollArea className="flex-1 py-3">
                    <nav className="space-y-0.5 px-2">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.href}
                                item={item}
                                collapsed={collapsed}
                                active={isActive(item.href)}
                            />
                        ))}

                        {adminItems.length > 0 && (
                            <>
                                <div className="py-2">
                                    {!collapsed && (
                                        <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                            Admin
                                        </p>
                                    )}
                                    {collapsed && <Separator className="my-1" />}
                                </div>
                                {adminItems.map((item) => (
                                    <NavLink
                                        key={item.href}
                                        item={item}
                                        collapsed={collapsed}
                                        active={isActive(item.href)}
                                    />
                                ))}
                            </>
                        )}
                    </nav>
                </ScrollArea>

                {/* Footer */}
                <div className="border-t border-border p-2 space-y-1">
                    {/* Theme toggle */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size={collapsed ? "icon" : "sm"}
                                className={cn("w-full", !collapsed && "justify-start gap-2")}
                                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            >
                                <Sun className="h-4 w-4 dark:hidden" />
                                <Moon className="hidden h-4 w-4 dark:block" />
                                {!collapsed && <span>Toggle theme</span>}
                            </Button>
                        </TooltipTrigger>
                        {collapsed && <TooltipContent side="right">Toggle theme</TooltipContent>}
                    </Tooltip>

                    {/* Collapse toggle (when collapsed) */}
                    {collapsed && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="w-full" onClick={onToggle}>
                                    <ChevronLeft className="h-4 w-4 rotate-180" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Expand sidebar</TooltipContent>
                        </Tooltip>
                    )}

                    {/* User + logout */}
                    {!collapsed && user && (
                        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand-muted))] text-[10px] font-bold text-[hsl(var(--brand))]">
                                {user.username[0].toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{user.username}</p>
                                <p className="truncate text-[10px] text-muted-foreground capitalize">{user.role}</p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                                onClick={logout}
                                aria-label="Log out"
                            >
                                <LogOut className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}

                    {collapsed && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-full"
                                    onClick={logout}
                                    aria-label="Log out"
                                >
                                    <LogOut className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Log out</TooltipContent>
                        </Tooltip>
                    )}
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
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground",
                collapsed && "justify-center px-2",
            )}
        >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {!collapsed && item.badge ? (
                <Badge variant="secondary" className="ml-auto h-4 min-w-4 px-1 text-[10px]">
                    {item.badge}
                </Badge>
            ) : null}
        </Link>
    )

    if (collapsed) {
        return (
            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                    <TooltipContent side="right" className="flex items-center gap-2">
                        {item.label}
                        {item.badge ? <Badge variant="secondary">{item.badge}</Badge> : null}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )
    }

    return content
}