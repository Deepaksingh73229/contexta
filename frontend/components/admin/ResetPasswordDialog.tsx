"use client"

import { useState } from "react"
import { Loader2, Copy, Check, KeyRound, AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { adminService } from "@/services"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/utils/cn"
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
            <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-2xl shadow-2xl shadow-black/20 dark:shadow-black/50 sm:rounded-2xl ring-1 ring-inset ring-neutral-200/80 dark:ring-white/10 transition-all">

                {/* ── Header ───────────────────────────────────────────────── */}
                <DialogHeader className="px-6 py-5 border-b border-neutral-100 dark:border-white/5 bg-[#FAFAFA]/50 dark:bg-transparent">
                    <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
                        <div className={cn(
                            "flex items-center justify-center size-8 rounded-lg transition-colors duration-300",
                            tempPassword
                                ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                : "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        )}>
                            <KeyRound className="size-4.5" />
                        </div>
                        Reset Password
                    </DialogTitle>
                </DialogHeader>

                {/* ── Body ─────────────────────────────────────────────────── */}
                <div className="px-6 py-6">
                    {error && (
                        <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-4 py-3 mb-4 animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                            <p className="text-[13px] font-medium text-rose-900 dark:text-rose-200">
                                {error}
                            </p>
                        </div>
                    )}

                    {!tempPassword ? (
                        /* Pre-Reset Warning State */
                        <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-4">
                            <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-amber-600 dark:text-amber-400" />
                            <p className="text-[13px] font-medium text-amber-900 dark:text-amber-200 leading-relaxed">
                                This will invalidate the current password and generate a secure temporary password for <strong className="font-bold text-amber-950 dark:text-amber-100">@{user.username}</strong>. They will be required to change it upon their next login.
                            </p>
                        </div>
                    ) : (
                        /* Post-Reset Success State */
                        <div className="flex flex-col items-center justify-center animate-in zoom-in-95 duration-400 ease-out py-2">
                            <div className="flex flex-col items-center text-center space-y-2 mb-6">
                                <div className="size-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center mb-1 shadow-lg shadow-emerald-500/30">
                                    <CheckCircle2 className="size-6" />
                                </div>
                                <h3 className="text-[16px] font-bold text-neutral-900 dark:text-white tracking-tight">Password Generated</h3>
                                <p className="text-[13px] text-neutral-500 dark:text-neutral-400 max-w-[250px]">
                                    Copy this secret key now. For security reasons, it will not be shown again.
                                </p>
                            </div>

                            <div className="w-full relative flex items-center justify-between gap-3 p-1.5 pl-4 rounded-xl bg-neutral-100 dark:bg-[#050505] border border-neutral-200/80 dark:border-white/10 shadow-inner">
                                <code className="text-[15px] font-mono font-bold text-neutral-900 dark:text-emerald-400 tracking-widest select-all">
                                    {tempPassword}
                                </code>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                        "size-9 rounded-lg shrink-0 border-0 transition-all duration-200",
                                        copied
                                            ? "bg-emerald-100 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/20 dark:text-emerald-400"
                                            : "bg-white hover:bg-neutral-50 text-neutral-500 hover:text-neutral-900 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-400 dark:hover:text-white shadow-sm"
                                    )}
                                    onClick={handleCopy}
                                    title="Copy to clipboard"
                                >
                                    {copied ? <Check className="size-4.5" /> : <Copy className="size-4.5" />}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Footer Actions ───────────────────────────────────────── */}
                <div className="px-6 py-4 bg-neutral-50 dark:bg-[#111]/50 border-t border-neutral-100 dark:border-white/5 flex items-center justify-end gap-2">
                    <Button
                        variant="ghost"
                        onClick={handleClose}
                        className="h-10 px-4 rounded-xl text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 font-medium"
                    >
                        {tempPassword ? "Done" : "Cancel"}
                    </Button>

                    {!tempPassword && (
                        <Button
                            onClick={handleReset}
                            disabled={loading}
                            className="h-10 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white shadow-sm shadow-amber-500/20 transition-all active:scale-[0.98]"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                "Generate Password"
                            )}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}