// components/admin/CreateUserDialog.tsx
"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { adminService } from "@/services"
import { ROLE_LABELS } from "@/utils"
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
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create new user</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5 col-span-2">
                            <Label>Full name</Label>
                            <Input
                                value={form.full_name}
                                onChange={(e) => set("full_name")(e.target.value)}
                                placeholder="Jane Smith"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Username</Label>
                            <Input
                                value={form.username}
                                onChange={(e) => set("username")(e.target.value)}
                                placeholder="jane.smith"
                                pattern="[a-zA-Z0-9._-]+"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Role</Label>
                            <Select value={form.role} onValueChange={(v) => set("role")(v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ROLES.map((r) => (
                                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <Label>Email</Label>
                            <Input
                                type="email"
                                value={form.email}
                                onChange={(e) => set("email")(e.target.value)}
                                placeholder="jane@company.com"
                                required
                            />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <Label>Password</Label>
                            <Input
                                type="password"
                                value={form.password}
                                onChange={(e) => set("password")(e.target.value)}
                                placeholder="Min 8 chars, upper, lower, digit, special"
                                required
                                minLength={8}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create user
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}