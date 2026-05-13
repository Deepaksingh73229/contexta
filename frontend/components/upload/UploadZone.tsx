"use client"

import { useRef } from "react"
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, CloudUpload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUpload } from "@/lib/hooks"
import { useTaskStream } from "@/lib/hooks"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/utils/cn"

export function UploadZone() {
    const { toast } = useToast()
    const inputRef = useRef<HTMLInputElement>(null)

    const { state, upload, reset, isDragging, dragProps } = useUpload({
        onAccepted: (task) => {
            toast({
                title: "Upload Accepted",
                description: `"${task.filename}" is securely in queue. Processing will begin shortly.`,
            })
        },

        onError: (msg) => {
            toast({ title: "Upload Failed", description: msg, variant: "destructive" })
        },
    })

    // Stream the task if accepted
    useTaskStream(
        state.phase === "accepted" ? state.task.task_id : null,
        {
            onDone: (t) => toast({ title: "Ingestion Complete", description: `"${t.filename}" has been successfully vectorized and is ready to query.` }),
            onFail: (t) => toast({ title: "Ingestion Failed", description: t.error ?? "The system encountered an unknown error during processing.", variant: "destructive" }),
        },
    )

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        upload(e.target.files?.[0])
        if (inputRef.current) inputRef.current.value = ""
    }

    return (
        <div
            {...dragProps}
            className={cn(
                "relative flex flex-col items-center justify-center rounded-2xl p-12 text-center transition-all duration-300 ease-out min-h-[300px]",
                "bg-white/50 dark:bg-neutral-900/30 backdrop-blur-xl border-2 border-dashed shadow-sm",

                // Idle / Hover
                !isDragging && state.phase === "idle" && "border-neutral-300 dark:border-neutral-700 hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50/50 dark:hover:bg-violet-500/5",

                // Dragging Over
                isDragging && "border-violet-500 bg-violet-100/50 dark:bg-violet-500/10 scale-[0.99] shadow-inner",

                // Error State
                state.phase === "error" && "border-rose-400 bg-rose-50/50 dark:bg-rose-950/20",

                // Accepted State
                state.phase === "accepted" && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
            )}
        >
            <input
                ref={inputRef}
                type="file"
                accept=".png, .jpg, .jpeg, .pdf, application/pdf"
                className="sr-only"
                onChange={handleFileChange}
                aria-label="Upload Image or PDF Document"
            />

            {/* ── Icon Container ────────────────────────────────────────────── */}
            <div className="relative mb-6">
                {/* Active glow rings */}
                {(state.phase === "uploading" || state.phase === "validating" || isDragging) && (
                    <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-xl animate-pulse" />
                )}

                <div className={cn(
                    "relative flex size-16 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset transition-colors duration-500",
                    state.phase === "error" ? "bg-rose-100 dark:bg-rose-500/20 ring-rose-200 dark:ring-rose-500/30 text-rose-600 dark:text-rose-400" :
                        state.phase === "accepted" ? "bg-emerald-100 dark:bg-emerald-500/20 ring-emerald-200 dark:ring-emerald-500/30 text-emerald-600 dark:text-emerald-400" :
                            isDragging ? "bg-violet-100 dark:bg-violet-500/20 ring-violet-300 dark:ring-violet-500/30 text-violet-600 dark:text-violet-400 scale-110" :
                                "bg-white dark:bg-neutral-800 ring-neutral-200/80 dark:ring-white/10 text-neutral-500 dark:text-neutral-400"
                )}>
                    {state.phase === "uploading" || state.phase === "validating" ? (
                        <Loader2 className="size-7 animate-spin text-violet-600 dark:text-violet-400" />
                    ) : state.phase === "accepted" ? (
                        <CheckCircle2 className="size-7" />
                    ) : state.phase === "error" ? (
                        <AlertCircle className="size-7" />
                    ) : isDragging ? (
                        <CloudUpload className="size-7" />
                    ) : (
                        <Upload className="size-7" />
                    )}
                </div>
            </div>

            {/* ── Typography & Messaging ────────────────────────────────────── */}
            <div className="space-y-1.5 mb-8">
                {state.phase === "idle" && (
                    <>
                        <h3 className="text-[16px] font-bold text-neutral-900 dark:text-white tracking-tight">
                            {isDragging ? "Drop document here" : "Upload Institutional Data"}
                        </h3>

                        <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                            Drag & drop Imgage or PDF, or click to browse files.
                        </p>
                    </>
                )}

                {(state.phase === "validating" || state.phase === "uploading") && (
                    <>
                        <h3 className="text-[16px] font-bold text-neutral-900 dark:text-white tracking-tight animate-pulse">
                            {state.phase === "validating" ? "Validating Document..." : "Uploading..."}
                        </h3>

                        <p className="text-[13px] font-medium text-violet-600 dark:text-violet-400 max-w-xs truncate">
                            {state.filename}
                        </p>
                    </>
                )}

                {state.phase === "accepted" && (
                    <>
                        <h3 className="text-[16px] font-bold text-emerald-700 dark:text-emerald-400 tracking-tight">
                            Upload Successful
                        </h3>

                        <p className="text-[13px] font-medium text-emerald-600/80 dark:text-emerald-400/80 max-w-xs truncate">
                            "{state.task.filename}" is now processing.
                        </p>
                    </>
                )}

                {state.phase === "error" && (
                    <>
                        <h3 className="text-[16px] font-bold text-rose-700 dark:text-rose-400 tracking-tight">
                            Upload Failed
                        </h3>

                        <p className="text-[13px] font-medium text-rose-600/80 dark:text-rose-400/80">
                            {state.message}
                        </p>
                    </>
                )}
            </div>

            {/* ── Actions ────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
                <Button
                    variant={state.phase === "accepted" ? "outline" : "default"}
                    className={cn(
                        "h-10 px-6 rounded-full shadow-sm transition-all active:scale-[0.98]",
                        state.phase === "idle" && "bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-900",
                        state.phase === "accepted" && "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0A0A0A] hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-300"
                    )}
                    onClick={() => inputRef.current?.click()}
                    disabled={state.phase === "uploading" || state.phase === "validating" || isDragging}
                >
                    <FileText className="mr-2 size-4" />
                    <span className="text-[13px] font-semibold">
                        {state.phase === "accepted" ? "Upload Another File" : "Select Document"}
                    </span>
                </Button>

                {state.phase !== "idle" && (
                    <Button
                        variant="ghost"
                        onClick={reset}
                        className="h-10 px-4 rounded-full text-[13px] font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                    >
                        Clear
                    </Button>
                )}
            </div>

            {/* Subtle constraints text (only shows when idle) */}
            {state.phase === "idle" && !isDragging && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                    <span className="text-[11px] font-medium tracking-wide text-neutral-400 dark:text-neutral-500 uppercase">
                        Img & PDF Format Only • Max Size 50MB
                    </span>
                </div>
            )}
        </div>
    )
}