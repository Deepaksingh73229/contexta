// ============================================================
// lib/hooks/useTaskStream.ts
// Connects SSE/polling to the Redux tasks slice.
// Start streaming a task immediately after upload.
// ============================================================

"use client"

import { useEffect, useRef, useCallback } from "react"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import {
    applySSEUpdate,
    fetchTask,
    markStreaming,
    markStreamClosed,
    selectTask,
} from "@/store/slices/tasksSlice"
import { tasksService } from "@/services"
import { TERMINAL_STATUSES } from "@/config/api.config"
import type { TaskSSEEvent, TaskStatusResponse } from "@/types"

interface UseTaskStreamOptions {
    /** Called when the task reaches a terminal state */
    onDone?: (task: TaskStatusResponse) => void
    /** Called when the task fails */
    onFail?: (task: TaskStatusResponse) => void
}

/**
 * Hook that subscribes to live task progress for a given task_id.
 * Automatically uses SSE with polling fallback.
 * Writes all updates into the Redux store.
 *
 * @example
 * const { task, isStreaming } = useTaskStream(taskId, {
 *   onDone: (t) => toast.success(`${t.filename} is ready!`),
 * })
 */
export function useTaskStream(
    taskId: string | null,
    options: UseTaskStreamOptions = {},
) {
    const dispatch = useAppDispatch()
    const task = useAppSelector(taskId ? selectTask(taskId) : () => null)
    const cleanupRef = useRef<(() => void) | null>(null)
    const { onDone, onFail } = options

    const startStream = useCallback(
        (id: string) => {
            // Don't start if already terminal
            const currentTask = task
            if (currentTask && TERMINAL_STATUSES.has(currentTask.status)) return

            dispatch(markStreaming(id))

            const stop = tasksService.streamWithFallback(
                id,
                (update) => {
                    dispatch(applySSEUpdate(update as TaskSSEEvent))
                },
                (finalTask) => {
                    // Fetch the full record to ensure all fields are up to date
                    dispatch(fetchTask(id)).then((action) => {
                        if (fetchTask.fulfilled.match(action)) {
                            if (action.payload.status === "done") {
                                onDone?.(action.payload)
                            } else if (action.payload.status === "failed") {
                                onFail?.(action.payload)
                            }
                        }
                    })
                    dispatch(markStreamClosed(id))
                },
                (err) => {
                    console.warn(`Task stream error for ${id}:`, err)
                    dispatch(markStreamClosed(id))
                },
            )

            cleanupRef.current = stop
        },
        [dispatch, onDone, onFail, task],
    )

    useEffect(() => {
        if (!taskId) return

        startStream(taskId)

        return () => {
            cleanupRef.current?.()
            dispatch(markStreamClosed(taskId))
        }
    }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

    return {
        task,
        isStreaming: !!taskId && task
            ? !TERMINAL_STATUSES.has(task.status)
            : false,
    }
}