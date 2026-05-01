// ============================================================
// services/tasks.service.ts
// Ingestion task management — polling, SSE stream, cancel/delete.
// ============================================================

import { apiClient, tokenStore } from "@/lib/api-client"
import { API_CONFIG, ENDPOINTS, TERMINAL_STATUSES } from "@/config/api.config"
import type {
    TaskStatusResponse,
    TaskListResponse,
    TaskSSEEvent,
} from "@/types"

export const tasksService = {
    /**
     * List all ingestion tasks.
     * @param includeDone - Include completed/failed/cancelled tasks
     */
    list: (includeDone = false): Promise<TaskListResponse> =>
        apiClient.get<TaskListResponse>(
            `${ENDPOINTS.TASKS.LIST}?include_done=${includeDone}`,
        ),

    /**
     * Get live status for a single task.
     */
    get: (taskId: string): Promise<TaskStatusResponse> =>
        apiClient.get<TaskStatusResponse>(ENDPOINTS.TASKS.GET(taskId)),

    /**
     * Cancel a running or queued task.
     */
    cancel: (taskId: string): Promise<{ status: string; message: string }> =>
        apiClient.post(ENDPOINTS.TASKS.CANCEL(taskId)),

    /**
     * Delete a terminal task record (done/failed/cancelled only).
     */
    delete: (taskId: string): Promise<{ status: string; message: string }> =>
        apiClient.delete(ENDPOINTS.TASKS.DELETE(taskId)),

    // ── Polling ───────────────────────────────────────────────

    /**
     * Poll a task until it reaches a terminal state.
     *
     * @param taskId - The task to poll
     * @param onProgress - Called on every poll with the latest TaskStatusResponse
     * @param intervalMs - How often to poll (default: API_CONFIG.POLL_INTERVAL)
     * @returns The final TaskStatusResponse when done/failed/cancelled
     *
     * @example
     * const final = await tasksService.poll(taskId, (task) => {
     *   setProgress(task.pct)
     * })
     */
    poll: (
        taskId: string,
        onProgress?: (task: TaskStatusResponse) => void,
        intervalMs = API_CONFIG.POLL_INTERVAL,
    ): Promise<TaskStatusResponse> => {
        return new Promise((resolve, reject) => {
            const tick = async () => {
                try {
                    const task = await tasksService.get(taskId)
                    onProgress?.(task)
                    if (TERMINAL_STATUSES.has(task.status)) {
                        resolve(task)
                    } else {
                        setTimeout(tick, intervalMs)
                    }
                } catch (err) {
                    reject(err)
                }
            }
            tick()
        })
    },

    // ── Server-Sent Events stream ─────────────────────────────

    /**
     * Open an SSE stream for real-time task progress.
     * Automatically closes when the task reaches a terminal state.
     *
     * @param taskId - The task to stream
     * @param onEvent - Called on every SSE event
     * @param onError - Called on connection error
     * @returns A cleanup function — call it to close the stream manually
     *
     * @example
     * const close = tasksService.stream(taskId, (event) => {
     *   setProgress(event.pct)
     *   if (event.status === 'done') showSuccess()
     * })
     * // later: close()
     */
    stream: (
        taskId: string,
        onEvent: (event: TaskSSEEvent) => void,
        onError?: (err: Event) => void,
    ): (() => void) => {
        const token = tokenStore.getAccess()
        // SSE doesn't support custom headers in browser EventSource API,
        // so the backend must accept the token via cookie or this falls back
        // to polling. For now we open the stream URL directly; if auth is
        // cookie-based this works; if header-only we use polling instead.
        const url = `${API_CONFIG.BASE_URL}${ENDPOINTS.TASKS.STREAM(taskId)}${token ? `?token=${token}` : ""
            }`

        const es = new EventSource(url)

        es.onmessage = (e: MessageEvent) => {
            try {
                const data: TaskSSEEvent = JSON.parse(e.data)
                onEvent(data)
                if (TERMINAL_STATUSES.has(data.status)) {
                    es.close()
                }
            } catch {
                // Silently ignore malformed events
            }
        }

        es.onerror = (e) => {
            onError?.(e)
            es.close()
        }

        return () => es.close()
    },

    /**
     * Convenience: stream with automatic fallback to polling if SSE fails.
     * Returns a cleanup / cancel function.
     *
     * @example
     * const stop = tasksService.streamWithFallback(taskId, (update) => {
     *   dispatch(updateTask(update))
     * })
     */
    streamWithFallback: (
        taskId: string,
        onUpdate: (task: Partial<TaskSSEEvent & TaskStatusResponse>) => void,
        onDone?: (task: TaskStatusResponse) => void,
        onFail?: (err: unknown) => void,
    ): (() => void) => {
        let cancelled = false
        let sseCleanup: (() => void) | null = null
        let pollingTimer: ReturnType<typeof setTimeout> | null = null
        let useFallback = false

        const startPolling = () => {
            const tick = async () => {
                if (cancelled) return
                try {
                    const task = await tasksService.get(taskId)
                    onUpdate(task)
                    if (TERMINAL_STATUSES.has(task.status)) {
                        onDone?.(task)
                    } else {
                        pollingTimer = setTimeout(tick, API_CONFIG.POLL_INTERVAL)
                    }
                } catch (err) {
                    onFail?.(err)
                }
            }
            tick()
        }

        // Try SSE first
        sseCleanup = tasksService.stream(
            taskId,
            (event) => {
                onUpdate(event)
                if (TERMINAL_STATUSES.has(event.status) && !cancelled) {
                    // Fetch final full TaskStatusResponse for onDone
                    tasksService.get(taskId).then(onDone).catch(() => { })
                }
            },
            () => {
                // SSE failed — fall back to polling
                if (!cancelled && !useFallback) {
                    useFallback = true
                    startPolling()
                }
            },
        )

        return () => {
            cancelled = true
            sseCleanup?.()
            if (pollingTimer) clearTimeout(pollingTimer)
        }
    },
}