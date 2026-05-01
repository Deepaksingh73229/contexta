"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    MessageSquare, Upload, FileText, Users, ClipboardList, Database, PanelLeftClose, PanelLeftOpen
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { usePermission } from "@/lib/hooks"
import { useAppSelector } from "@/store/hooks"
import { selectActiveTasks } from "@/store/slices/tasksSlice"
import { cn } from "@/utils/cn"

import { NavItem, SidebarProps } from "@/types/index"
import { SidebarItem } from "./sidebar-item"
import { SidebarFooter } from "./sidebar-footer"
import { ContextaLogo } from "@/components/ui/logo"

export function AppSidebar({ collapsed, onToggle }: SidebarProps) {
    const pathname = usePathname()
    const { canUpload, canViewDocs, canManageUsers, canViewAudit } = usePermission()
    const activeTasks = useAppSelector(selectActiveTasks)

    const navItems: NavItem[] = [
        { href: "/dashboard", label: "Ask Contexta", icon: MessageSquare },
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
        <aside
            className={cn(
                "relative flex h-screen flex-col bg-neutral-50/80 dark:bg-[#050505]/80 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] border-r border-neutral-200/50 dark:border-white/[0.05] z-40",
                collapsed ? "w-19" : "w-64"
            )}
        >
            {/* ── Top Brand Area ───────────────────────────────────────────── */}
            <div className={cn(
                "flex h-16 shrink-0 items-center px-4 mb-4 mt-2 transition-all duration-300",
                collapsed ? "justify-center px-0" : "justify-between"
            )}>
                <Link href="/dashboard" className="flex items-center gap-3 group transition-all duration-300">
                    <ContextaLogo size={collapsed ? "sm" : "md"} className="transition-transform group-hover:scale-105" />
                    {!collapsed && (
                        <span className="font-bold text-lg tracking-tight text-neutral-900 dark:text-white">
                            Contexta
                        </span>
                    )}
                </Link>

                {!collapsed && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/80 dark:hover:bg-white/10 rounded-lg transition-all"
                        onClick={onToggle}
                    >
                        <PanelLeftClose className="size-4.5" />
                    </Button>
                )}
            </div>

            {/* Toggle Button for Collapsed State */}
            {collapsed && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -right-3.5 top-20 z-50 size-7 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-500 hover:text-neutral-900 dark:hover:text-white shadow-sm transition-all"
                    onClick={onToggle}
                >
                    <PanelLeftOpen className="size-3.5" />
                </Button>
            )}

            {/* ── Navigation Items ──────────────────────────────────────────── */}
            <ScrollArea className="flex-1 px-3">
                <nav className="space-y-1 pb-4">
                    {navItems.map((item) => (
                        <SidebarItem
                            key={item.href}
                            item={item}
                            collapsed={collapsed}
                            active={isActive(item.href)}
                        />
                    ))}

                    {adminItems.length > 0 && (
                        <div className="mt-8 mb-2">
                            {!collapsed ? (
                                <p className="px-3 text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-3">
                                    Administration
                                </p>
                            ) : (
                                <div className="flex justify-center mb-3">
                                    <div className="h-px w-6 bg-neutral-200 dark:bg-white/10" />
                                </div>
                            )}
                            <div className="space-y-1">
                                {adminItems.map((item) => (
                                    <SidebarItem
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
            <SidebarFooter collapsed={collapsed} />
        </aside>
    )
}