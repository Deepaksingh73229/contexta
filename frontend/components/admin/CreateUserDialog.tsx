"use client"

import { useState } from "react"
import { Loader2, UserPlus, AlertCircle } from "lucide-react"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { adminService } from "@/services"
import { ROLE_LABELS } from "@/utils"
import { cn } from "@/utils/cn"
import type { AdminUser, Role } from "@/types"

const ROLES: Role[] = ["admin", "manager", "analyst", "viewer"]

interface CreateUserDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated: (user: AdminUser) => void
}

const EMPTY = { username: "", email: "", full_name: "", role: "analyst" as Role, password: "" }

export function CreateUserDialog({ open, onOpenChange, onCreated }: CreateUserDialogProps) {
    const [form, setForm] = useState(EMPTY)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const set = (k: keyof typeof EMPTY) => (v: string) =>
        setForm((f) => ({ ...f, [k]: v }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const user = await adminService.createUser(form)
            onCreated(user)
            setForm(EMPTY)
        } catch (err: any) {
            setError(err.detail ?? "Failed to create user")
        } finally {
            setLoading(false)
        }
    }

    const handleOpenChange = (o: boolean) => {
        if (!o) { setForm(EMPTY); setError(null) }
        onOpenChange(o)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-2xl shadow-2xl shadow-black/20 dark:shadow-black/50 sm:rounded-2xl ring-1 ring-inset ring-neutral-200/80 dark:ring-white/10">

                {/* ── Header ───────────────────────────────────────────────── */}
                <DialogHeader className="px-6 py-5 border-b border-neutral-100 dark:border-white/5">
                    <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
                        <div className="flex items-center justify-center size-8 rounded-lg bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400">
                            <UserPlus className="size-4.5" />
                        </div>
                        Create New User
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col">

                    {/* ── Form Body ────────────────────────────────────────────── */}
                    <div className="px-6 py-5 space-y-5">
                        {error && (
                            <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-4 py-3 animate-in fade-in slide-in-from-top-2">
                                <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                                <p className="text-[13px] font-medium text-rose-900 dark:text-rose-200">
                                    {error}
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5 col-span-2">
                                <Label className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">Full Name</Label>
                                <Input
                                    value={form.full_name}
                                    onChange={(e) => set("full_name")(e.target.value)}
                                    placeholder="Jane Smith"
                                    required
                                    className="h-10 rounded-xl bg-neutral-50 dark:bg-[#111] border-neutral-200 dark:border-neutral-800 focus-visible:ring-2 focus-visible:ring-violet-500/50 shadow-sm"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">Username</Label>
                                <Input
                                    value={form.username}
                                    onChange={(e) => set("username")(e.target.value)}
                                    placeholder="jane.smith"
                                    pattern="[a-zA-Z0-9._-]+"
                                    required
                                    className="h-10 rounded-xl bg-neutral-50 dark:bg-[#111] border-neutral-200 dark:border-neutral-800 focus-visible:ring-2 focus-visible:ring-violet-500/50 shadow-sm"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">Role</Label>
                                <Select value={form.role} onValueChange={(v) => set("role")(v as Role)}>
                                    <SelectTrigger className="h-10 rounded-xl bg-neutral-50 dark:bg-[#111] border-neutral-200 dark:border-neutral-800 focus:ring-2 focus:ring-violet-500/50 shadow-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-neutral-200 dark:border-neutral-800 shadow-xl">
                                        {ROLES.map((r) => (
                                            <SelectItem key={r} value={r} className="rounded-lg cursor-pointer">
                                                {ROLE_LABELS[r]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5 col-span-2">
                                <Label className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">Email Address</Label>
                                <Input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => set("email")(e.target.value)}
                                    placeholder="jane@company.com"
                                    required
                                    className="h-10 rounded-xl bg-neutral-50 dark:bg-[#111] border-neutral-200 dark:border-neutral-800 focus-visible:ring-2 focus-visible:ring-violet-500/50 shadow-sm"
                                />
                            </div>

                            <div className="space-y-1.5 col-span-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">Password</Label>
                                    <span className="text-[11px] text-neutral-500">Min 8 characters</span>
                                </div>
                                <Input
                                    type="password"
                                    value={form.password}
                                    onChange={(e) => set("password")(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    minLength={8}
                                    className="h-10 rounded-xl bg-neutral-50 dark:bg-[#111] border-neutral-200 dark:border-neutral-800 focus-visible:ring-2 focus-visible:ring-violet-500/50 shadow-sm font-mono placeholder:font-sans"
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Footer Actions ───────────────────────────────────────── */}
                    <div className="px-6 py-4 bg-neutral-50 dark:bg-[#111]/50 border-t border-neutral-100 dark:border-white/5 flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleOpenChange(false)}
                            className="h-10 px-4 rounded-xl text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading || !form.username || !form.password}
                            className="h-10 px-6 rounded-xl bg-violet-600 hover:bg-violet-500 text-white shadow-sm shadow-violet-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                "Create User"
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}