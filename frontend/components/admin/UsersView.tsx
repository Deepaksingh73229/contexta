"use client"

import { useState, useEffect } from "react"
import {
    Plus, MoreHorizontal, Shield, UserX, UserCheck,
    KeyRound, Trash2, RefreshCw, Search, Users as UsersIcon
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { CreateUserDialog } from "./CreateUserDialog"
import { ResetPasswordDialog } from "./ResetPasswordDialog"
import { adminService } from "@/services"
import { useAuth } from "@/lib/hooks"
import { useToast } from "@/components/ui/use-toast"
import { ROLE_LABELS, roleBadgeVariant, timeAgo } from "@/utils"
import { cn } from "@/utils/cn"
import type { AdminUser } from "@/types"

export function UsersView() {
    const { toast } = useToast()
    const { user: me } = useAuth()
    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [createOpen, setCreateOpen] = useState(false)
    const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)

    const load = async () => {
        setLoading(true)
        try {
            const res = await adminService.listUsers()
            setUsers(res.users)
        } catch (err: any) {
            toast({ title: "Failed to load users", description: err.detail, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, []) // eslint-disable-line

    const handleToggleActive = async (u: AdminUser) => {
        try {
            const updated = await adminService.updateUser(u.user_id, { is_active: !u.is_active })
            setUsers((prev) => prev.map((x) => x.user_id === u.user_id ? updated : x))
            toast({ title: `User ${updated.is_active ? "activated" : "deactivated"}` })
        } catch (err: any) {
            toast({ title: "Update failed", description: err.detail, variant: "destructive" })
        }
    }

    const handleDelete = async () => {
        if (!deleteTarget) return
        try {
            await adminService.deleteUser(deleteTarget.user_id)
            setUsers((prev) => prev.filter((u) => u.user_id !== deleteTarget.user_id))
            toast({ title: "User deleted" })
        } catch (err: any) {
            toast({ title: "Delete failed", description: err.detail, variant: "destructive" })
        } finally {
            setDeleteTarget(null)
        }
    }

    const filtered = users.filter((u) =>
        search === "" ||
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.full_name.toLowerCase().includes(search.toLowerCase()),
    )

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500">

            <PageHeader
                title="User Management"
                description="Manage user accounts, roles, and platform access control."
                action={
                    <Button
                        size="sm"
                        onClick={() => setCreateOpen(true)}
                        className="h-9 px-4 rounded-full bg-violet-600 hover:bg-violet-500 text-white shadow-sm shadow-violet-500/20 transition-all active:scale-95"
                    >
                        <Plus className="mr-1.5 size-4" />
                        <span className="text-[13px] font-semibold">New User</span>
                    </Button>
                }
            />

            {/* ── Toolbar ────────────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/40 dark:bg-neutral-900/40 p-3 rounded-2xl border border-neutral-200/60 dark:border-white/5 shadow-sm">
                <div className="relative w-full sm:max-w-md group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                        <Search className="size-4 text-neutral-400 group-focus-within:text-violet-500 transition-colors" />
                    </div>
                    <Input
                        placeholder="Search by name, username, or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 h-10 rounded-xl bg-white dark:bg-[#0A0A0A] border-neutral-200/80 dark:border-white/10 focus-visible:ring-2 focus-visible:ring-violet-500/50 shadow-sm transition-all text-[14px]"
                    />
                </div>

                <div className="flex items-center gap-3 px-2 sm:px-0">
                    <div className="flex items-center gap-2 mr-2">
                        <UsersIcon className="size-4 text-neutral-400" />
                        <span className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">
                            {filtered.length} <span className="text-neutral-400 font-medium">Users</span>
                        </span>
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={load}
                        disabled={loading}
                        className="size-10 rounded-xl bg-white dark:bg-[#0A0A0A] border-neutral-200 dark:border-neutral-800 hover:border-violet-300 dark:hover:border-violet-700 transition-all shadow-sm"
                        title="Sync Users"
                    >
                        <RefreshCw className={cn("size-4 text-neutral-500", loading && "animate-spin text-violet-500")} />
                    </Button>
                </div>
            </div>

            {/* ── User List ──────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white/60 dark:bg-[#0A0A0A]/60 backdrop-blur-md shadow-sm overflow-hidden flex flex-col">

                {/* Header Row */}
                <div className="hidden md:grid grid-cols-[1.5fr_1.5fr_100px_140px_50px] gap-4 border-b border-neutral-200 dark:border-white/10 bg-neutral-50/80 dark:bg-neutral-900/80 px-5 py-3 sticky top-0 z-10 backdrop-blur-md">
                    {["User", "Email Address", "Role", "Last Login", ""].map((h, i) => (
                        <span key={i} className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                            {h}
                        </span>
                    ))}
                </div>

                {loading && users.length === 0 ? (
                    <div className="p-4 space-y-3">
                        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl bg-neutral-200/50 dark:bg-neutral-800/50" />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-12">
                        <EmptyState
                            icon={Shield}
                            title="No users found"
                            description={search ? "Adjust your search filters." : "No active users exist in the system."}
                        />
                    </div>
                ) : (
                    <ScrollArea className="max-h-[65vh]">
                        <div className="divide-y divide-neutral-100 dark:divide-white/5">
                            {filtered.map((u) => (
                                <div
                                    key={u.user_id}
                                    className={cn(
                                        "grid grid-cols-1 md:grid-cols-[1.5fr_1.5fr_100px_140px_50px] items-center gap-4 px-5 py-3.5 bg-transparent hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors group",
                                        !u.is_active && "bg-neutral-50/50 dark:bg-neutral-900/20"
                                    )}
                                >
                                    {/* User Column */}
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <div className={cn(
                                            "flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold shadow-inner transition-all",
                                            u.is_active
                                                ? "bg-gradient-to-br from-violet-100 to-violet-200 dark:from-violet-500/20 dark:to-violet-500/30 text-violet-700 dark:text-violet-300"
                                                : "bg-neutral-200 dark:bg-neutral-800 text-neutral-400"
                                        )}>
                                            {u.username[0].toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className={cn(
                                                    "truncate text-[14px] font-semibold transition-colors",
                                                    u.is_active ? "text-neutral-900 dark:text-white" : "text-neutral-500"
                                                )}>
                                                    {u.full_name}
                                                </p>
                                                {u.user_id === me?.user_id && (
                                                    <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest h-4 px-1.5 border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50">
                                                        You
                                                    </Badge>
                                                )}
                                                {!u.is_active && (
                                                    <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest h-4 px-1.5 border-neutral-200 dark:border-neutral-700 text-neutral-500 bg-neutral-100 dark:bg-neutral-800">
                                                        Deactivated
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400 tracking-tight">
                                                @{u.username}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Email Column */}
                                    <p className={cn(
                                        "truncate text-[13px] font-medium hidden md:block",
                                        u.is_active ? "text-neutral-600 dark:text-neutral-300" : "text-neutral-400 dark:text-neutral-600"
                                    )}>
                                        {u.email}
                                    </p>

                                    {/* Role Column */}
                                    <div className="hidden md:flex">
                                        <Badge variant={roleBadgeVariant(u.role)} className={cn(
                                            "text-[11px] font-semibold px-2 py-0.5 rounded-md shadow-sm",
                                            !u.is_active && "opacity-50 grayscale"
                                        )}>
                                            {ROLE_LABELS[u.role]}
                                        </Badge>
                                    </div>

                                    {/* Last Login Column */}
                                    <div className="hidden md:flex flex-col">
                                        <p className={cn(
                                            "text-[12px] font-medium whitespace-nowrap",
                                            u.is_active ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-400 dark:text-neutral-600"
                                        )}>
                                            {u.last_login ? timeAgo(u.last_login) : "Never Logged In"}
                                        </p>
                                    </div>

                                    {/* Actions Column */}
                                    <div className="ml-auto md:ml-0 flex justify-end">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50"
                                                >
                                                    <MoreHorizontal className="size-4.5" />
                                                    <span className="sr-only">Actions</span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl dark:shadow-black/50 border-neutral-200 dark:border-neutral-800">
                                                <DropdownMenuItem
                                                    onClick={() => handleToggleActive(u)}
                                                    disabled={u.user_id === me?.user_id}
                                                    className="py-2 cursor-pointer font-medium"
                                                >
                                                    {u.is_active ? (
                                                        <><UserX className="mr-2 size-4 text-neutral-500" /> Deactivate User</>
                                                    ) : (
                                                        <><UserCheck className="mr-2 size-4 text-emerald-500" /> Reactivate User</>
                                                    )}
                                                </DropdownMenuItem>

                                                {u.is_active && (
                                                    <DropdownMenuItem onClick={() => setResetTarget(u)} className="py-2 cursor-pointer font-medium">
                                                        <KeyRound className="mr-2 size-4 text-amber-500" />
                                                        Reset Password
                                                    </DropdownMenuItem>
                                                )}

                                                <DropdownMenuSeparator className="bg-neutral-100 dark:bg-neutral-800" />

                                                <DropdownMenuItem
                                                    className="py-2 cursor-pointer font-medium text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:text-rose-400 dark:focus:bg-rose-500/10"
                                                    onClick={() => setDeleteTarget(u)}
                                                    disabled={u.user_id === me?.user_id}
                                                >
                                                    <Trash2 className="mr-2 size-4" />
                                                    Delete Account
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </div>

            {/* ── Dialogs ────────────────────────────────────────────────────── */}
            <CreateUserDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onCreated={(u) => {
                    setUsers((prev) => [...prev, u])
                    setCreateOpen(false)
                    toast({ title: "User Created", description: `@${u.username} has been granted access.` })
                }}
            />

            {resetTarget && (
                <ResetPasswordDialog
                    user={resetTarget}
                    open={!!resetTarget}
                    onOpenChange={(o) => { if (!o) setResetTarget(null) }}
                />
            )}

            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
                title={`Delete @${deleteTarget?.username}?`}
                description="This action is permanent and cannot be undone. The user will be immediately disconnected and all access revoked."
                confirmLabel="Delete User"
                variant="destructive"
                onConfirm={handleDelete}
            />
        </div>
    )
}