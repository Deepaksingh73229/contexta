// components/upload/UploadZone.tsx
"use client"

import { useRef } from "react"
import { Upload, FileText, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUpload } from "@/lib/hooks"
import { useTaskStream } from "@/lib/hooks"
import { useToast } from "@/components/ui/use-toast"
import { formatBytes } from "@/utils"
import { cn } from "@/utils/cn"

export function UploadZone() {
    const { toast } = useToast()
    const inputRef = useRef<HTMLInputElement>(null)

    const { state, upload, reset, isDragging, dragProps } = useUpload({
        onAccepted: (task) => {
            toast({
                title: "Upload accepted",
                description: `"${task.filename}" is being processed. Track progress below.`,
            })
        },
        onError: (msg) => {
            toast({ title: "Upload failed", description: msg, variant: "destructive" })
        },
    })

    // Stream the task if accepted
    useTaskStream(
        state.phase === "accepted" ? state.task.task_id : null,
        {
            onDone: (t) => toast({ title: "Ingestion complete", description: `"${t.filename}" is ready to query.` }),
            onFail: (t) => toast({ title: "Ingestion failed", description: t.error ?? "Unknown error", variant: "destructive" }),
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
                "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-all duration-150",
                isDragging
                    ? "border-[hsl(var(--brand))] bg-[hsl(var(--brand-muted))]"
                    : "border-border hover:border-muted-foreground/40 hover:bg-accent/30",
                state.phase === "error" && "border-destructive/50 bg-destructive/5",
                state.phase === "accepted" && "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20",
            )}
        >
            <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="sr-only"
                onChange={handleFileChange}
                aria-label="Upload PDF"
            />

            {/* Icon */}
            <div className={cn(
                "mb-4 flex h-14 w-14 items-center justify-center rounded-full",
                state.phase === "error" ? "bg-destructive/10" :
                    state.phase === "accepted" ? "bg-emerald-100 dark:bg-emerald-900/30" :
                        "bg-muted",
            )}>
                {state.phase === "uploading" || state.phase === "validating" ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : state.phase === "accepted" ? (
                    <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                ) : state.phase === "error" ? (
                    <XCircle className="h-6 w-6 text-destructive" />
                ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                )}
            </div>

            {/* Copy */}
            {state.phase === "idle" && (
                <>
                    <p className="text-sm font-medium">Drop a PDF here, or click to browse</p>
                    <p className="mt-1 text-xs text-muted-foreground">PDF only · Max 50 MB</p>
                </>
            )}

            {(state.phase === "validating" || state.phase === "uploading") && (
                <>
                    <p className="text-sm font-medium">
                        {state.phase === "validating" ? "Validating…" : `Uploading "${state.filename}"…`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Please wait</p>
                </>
            )}

            {state.phase === "accepted" && (
                <>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                        "{state.task.filename}" uploaded successfully
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Ingestion started · Track progress below
                    </p>
                </>
            )}

            {state.phase === "error" && (
                <>
                    <p className="text-sm font-medium text-destructive">{state.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Try again with a valid PDF</p>
                </>
            )}

            {/* CTA button */}
            <div className="mt-4 flex gap-2">
                <Button
                    variant={state.phase === "accepted" ? "outline" : "default"}
                    size="sm"
                    onClick={() => inputRef.current?.click()}
                    disabled={state.phase === "uploading" || state.phase === "validating"}
                >
                    <FileText className="mr-2 h-4 w-4" />
                    {state.phase === "accepted" ? "Upload another" : "Choose file"}
                </Button>
                {state.phase !== "idle" && (
                    <Button variant="ghost" size="sm" onClick={reset}>
                        Reset
                    </Button>
                )}
            </div>
        </div>
    )
}