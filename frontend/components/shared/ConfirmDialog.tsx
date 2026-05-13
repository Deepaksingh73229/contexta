import { AlertTriangle, HelpCircle } from "lucide-react"
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/utils/cn"

interface ConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: "default" | "destructive"
    onConfirm: () => void
}

export function ConfirmDialog({
    open, onOpenChange, title, description,
    confirmLabel = "Confirm", cancelLabel = "Cancel",
    variant = "default", onConfirm,
}: ConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="sm:max-w-md p-0 overflow-hidden border-0 bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-2xl shadow-2xl shadow-black/20 dark:shadow-black/50 sm:rounded-2xl ring-1 ring-inset ring-neutral-200/80 dark:ring-white/10">

                {/* ── Header & Body ────────────────────────────────────────── */}
                <div className="px-6 py-6 pt-8 text-center sm:text-left flex flex-col sm:flex-row gap-4 sm:items-start">

                    {/* Intent Icon */}
                    <div className={cn(
                        "mx-auto sm:mx-0 flex size-12 sm:size-10 shrink-0 items-center justify-center rounded-full transition-colors",
                        variant === "destructive"
                            ? "bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400"
                            : "bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400"
                    )}>
                        {variant === "destructive" ? (
                            <AlertTriangle className="size-5 sm:size-4.5" />
                        ) : (
                            <HelpCircle className="size-5 sm:size-4.5" />
                        )}
                    </div>

                    {/* Text Content */}
                    <div className="space-y-2 mt-1 sm:mt-0">
                        <AlertDialogTitle className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
                            {title}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                            {description}
                        </AlertDialogDescription>
                    </div>
                </div>

                {/* ── Footer Actions ───────────────────────────────────────── */}
                <AlertDialogFooter className="px-6 py-4 bg-neutral-50 dark:bg-[#111]/50 border-t border-neutral-100 dark:border-white/5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                    <AlertDialogCancel className="mt-0 h-10 px-4 rounded-xl border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 font-medium transition-all">
                        {cancelLabel}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className={cn(
                            "h-10 px-5 rounded-xl shadow-sm transition-all active:scale-[0.98]",
                            variant === "destructive"
                                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20"
                                : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/20"
                        )}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>

            </AlertDialogContent>
        </AlertDialog>
    )
}