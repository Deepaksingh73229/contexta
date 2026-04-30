// components/admin/ResetPasswordDialog.tsx
"use client"

import { useState } from "react"
import { Loader2, Copy, Check, KeyRound } from "lucide-react"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { adminService } from "@/services"
import { useToast } from "@/components/ui/use-toast"
import type { AdminUser } from "@/types"

interface ResetPasswordDialogProps {
    user: AdminUser
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ResetPasswordDialog({ user, open, onOpenChange }: ResetPasswordDialogProps) {
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)
    const [tempPassword, setTempPassword] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleReset = async () => {
        setError(null)
        setLoading(true)
        try {
            const res = await adminService.resetPassword(user.user_id)
            setTempPassword(res.temporary_password)
        } catch (err: any) {
            setError(err.detail ?? "Reset failed")
        } finally {
            setLoading(false)
        }
    }

    const handleCopy = async () => {
        if (!tempPassword) return
        await navigator.clipboard.writeText(tempPassword)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        toast({ title: "Copied to clipboard" })
    }

    const handleClose = () => {
        setTempPassword(null)
        setError(null)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4" />
                        Reset password for @{user.username}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {!tempPassword ? (
                        <p className="text-sm text-muted-foreground">
                            This will generate a random temporary password. The user must change it on next login.
                            The password is shown <strong>once only</strong> — copy it immediately.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            <Alert>
                                <AlertDescription className="text-xs">
                                    Copy this password now. It will not be shown again.
                                </AlertDescription>
                            </Alert>
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2.5">
                                <code className="flex-1 text-sm font-mono tracking-wider select-all">
                                    {tempPassword}
                                </code>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={handleCopy}
                                >
                                    {copied
                                        ? <Check className="h-3.5 w-3.5 text-emerald-600" />
                                        : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        {tempPassword ? "Done" : "Cancel"}
                    </Button>
                    {!tempPassword && (
                        <Button onClick={handleReset} disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Generate password
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}