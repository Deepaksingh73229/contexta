// components/admin/UsersView.tsx
"use client"

import { useState, useEffect } from "react"
import {
    Plus, MoreHorizontal, Shield, UserX, UserCheck,
    KeyRound, Trash2, RefreshCw, Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { CreateUserDialog } from "./CreateUserDialog"
import { ResetPasswordDialog } from "./ResetPasswordDialog"
import { adminService } from "@/services"
import { useAuth } from "@/lib/hooks"
import { useToast } from "@/components/ui/use-toast"
import { ROLE_LABELS, roleBadgeVariant, formatTimestamp, timeAgo } from "@/utils"
import { cn } from "@/utils/cn"
import type { AdminUser, Role } from "@/types"

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
        <div className="space-y-6">
            <PageHeader
                title="User Management"
                description="Manage user accounts, roles and access control."
                action={
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        New user
                    </Button>
                }
            />

            {/* Toolbar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search users…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>
                <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                </Button>
            </div>

            {/* Table */}
            {loading && users.length === 0 ? (
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                </div>
            ) : filtered.length === 0 ? (
                <EmptyState icon={Shield} title="No users found" />
            ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-4 border-b border-border bg-muted/40 px-4 py-2.5">
                        {["User", "Email", "Role", "Last login", ""].map((h) => (
                            <span key={h} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {h}
                            </span>
                        ))}
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-border">
                        {filtered.map((u) => (
                            <div
                                key={u.user_id}
                                className={cn(
                                    "grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-4 px-4 py-3 bg-card hover:bg-accent/30 transition-colors",
                                    !u.is_active && "opacity-60",
                                )}
                            >
                                {/* User */}
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand-muted))] text-[11px] font-bold text-[hsl(var(--brand))]">
                                        {u.username[0].toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{u.full_name}</p>
                                        <p className="truncate text-[11px] text-muted-foreground">@{u.username}</p>
                                    </div>
                                    {u.user_id === me?.user_id && (
                                        <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">you</Badge>
                                    )}
                                </div>

                                {/* Email */}
                                <p className="truncate text-sm text-muted-foreground">{u.email}</p>

                                {/* Role */}
                                <Badge variant={roleBadgeVariant(u.role)} className="text-[11px]">
                                    {ROLE_LABELS[u.role]}
                                </Badge>

                                {/* Last login */}
                                <p className="text-xs text-muted-foreground whitespace-nowrap">
                                    {u.last_login ? timeAgo(u.last_login) : "Never"}
                                </p>

                                {/* Actions */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7">
                                            <MoreHorizontal className="h-4 w-4" />
                                            <span className="sr-only">Actions</span>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuItem
                                            onClick={() => handleToggleActive(u)}
                                            disabled={u.user_id === me?.user_id}
                                        >
                                            {u.is_active
                                                ? <><UserX className="mr-2 h-3.5 w-3.5" />Deactivate</>
                                                : <><UserCheck className="mr-2 h-3.5 w-3.5" />Activate</>}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setResetTarget(u)}>
                                            <KeyRound className="mr-2 h-3.5 w-3.5" />
                                            Reset password
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="text-destructive"
                                            onClick={() => setDeleteTarget(u)}
                                            disabled={u.user_id === me?.user_id}
                                        >
                                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Dialogs */}
            <CreateUserDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onCreated={(u) => {
                    setUsers((prev) => [...prev, u])
                    setCreateOpen(false)
                    toast({ title: "User created", description: `@${u.username} added successfully.` })
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
                description="This action is permanent. The user will lose all access immediately."
                confirmLabel="Delete user"
                variant="destructive"
                onConfirm={handleDelete}
            />
        </div>
    )
}