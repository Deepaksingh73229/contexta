// ============================================================
// lib/hooks/useUpload.ts
// PDF upload hook — handles file validation, upload, and
// immediately starts streaming the resulting task.
// ============================================================

"use client"

import { useState, useCallback, useRef } from "react"
import { useAppDispatch } from "@/store/hooks"
import { addPendingTask } from "@/store/slices/tasksSlice"
import { ingestService } from "@/services"
import { validatePDFFile } from "@/utils"
import type { TaskStatusResponse, TaskAcceptedResponse } from "@/types"

export type UploadState =
    | { phase: "idle" }
    | { phase: "validating" }
    | { phase: "uploading"; progress: number; filename: string }
    | { phase: "accepted"; task: TaskAcceptedResponse }
    | { phase: "error"; message: string }

interface UseUploadOptions {
    onAccepted?: (task: TaskAcceptedResponse) => void
    onError?: (message: string) => void
}

/**
 * Hook to manage PDF upload flow.
 *
 * @example
 * const { state, upload, reset, isDragging, dragProps } = useUpload({
 *   onAccepted: (task) => toast.success("Upload started!"),
 * })
 *
 * <div {...dragProps}>
 *   <input type="file" onChange={(e) => upload(e.target.files?.[0])} />
 * </div>
 */
export function useUpload(options: UseUploadOptions = {}) {
    const dispatch = useAppDispatch()
    const [state, setState] = useState<UploadState>({ phase: "idle" })
    const [isDragging, setIsDragging] = useState(false)
    const abortRef = useRef<AbortController | null>(null)

    const reset = useCallback(() => {
        abortRef.current?.abort()
        setState({ phase: "idle" })
    }, [])

    const upload = useCallback(
        async (file: File | null | undefined) => {
            if (!file) return

            // Validate
            setState({ phase: "validating" })
            const validationError = validatePDFFile(file)
            if (validationError) {
                setState({ phase: "error", message: validationError })
                options.onError?.(validationError)
                return
            }

            // Upload
            setState({ phase: "uploading", progress: 0, filename: file.name })
            try {
                const accepted = await ingestService.uploadPDF(file)

                // Immediately seed the task into the Redux store with a pending shape
                // so the UI can show it before the stream/poll gets the first update
                const pendingTask: TaskStatusResponse = {
                    task_id: accepted.task_id,
                    doc_id: accepted.doc_id,
                    filename: accepted.filename,
                    status: "queued",
                    stage: "queued",
                    stage_label: "Queued",
                    pct: 0,
                    total_nodes: 0,
                    nodes_done: 0,
                    eta_seconds: null,
                    current_node: null,
                    elapsed_seconds: 0,
                    error: null,
                    created_at: Date.now() / 1000,
                    started_at: null,
                    completed_at: null,
                }
                dispatch(addPendingTask(pendingTask))

                setState({ phase: "accepted", task: accepted })
                options.onAccepted?.(accepted)
            } catch (err: any) {
                const message = err.detail ?? "Upload failed. Please try again."
                setState({ phase: "error", message })
                options.onError?.(message)
            }
        },
        [dispatch, options],
    )

    // Drag-and-drop helpers
    const dragProps = {
        onDragOver: (e: React.DragEvent) => {
            e.preventDefault()
            setIsDragging(true)
        },
        onDragEnter: (e: React.DragEvent) => {
            e.preventDefault()
            setIsDragging(true)
        },
        onDragLeave: (e: React.DragEvent) => {
            // Only set false if leaving the element entirely (not a child)
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsDragging(false)
            }
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault()
            setIsDragging(false)
            const file = e.dataTransfer.files[0]
            upload(file)
        },
    }

    return {
        state,
        upload,
        reset,
        isDragging,
        dragProps,
        isUploading:
            state.phase === "uploading" || state.phase === "validating",
    }
}