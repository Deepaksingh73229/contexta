// ============================================================
// store/slices/tasksSlice.ts
// Ingestion task state — live progress, list, cancel, delete.
// ============================================================

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit"
import { tasksService } from "@/services"
import type { TaskStatusResponse, TaskListResponse, TaskSSEEvent } from "@/types"
import type { RootState } from "../store"

// ── State ─────────────────────────────────────────────────────

interface TasksState {
    tasks: Record<string, TaskStatusResponse>   // task_id → task
    orderedIds: string[]                         // for display ordering (newest first)
    listStatus: "idle" | "loading" | "succeeded" | "failed"
    listError: string | null
    activeStreamIds: Set<string>                 // tasks currently streaming
}

const initialState: TasksState = {
    tasks: {},
    orderedIds: [],
    listStatus: "idle",
    listError: null,
    activeStreamIds: new Set(),
}

// ── Thunks ────────────────────────────────────────────────────

export const fetchTasks = createAsyncThunk<TaskListResponse, boolean | undefined>(
    "tasks/fetchList",
    async (includeDone = false, { rejectWithValue }) => {
        try {
            return await tasksService.list(includeDone)
        } catch (err: any) {
            return rejectWithValue(err.detail ?? "Failed to load tasks")
        }
    },
)

export const fetchTask = createAsyncThunk<TaskStatusResponse, string>(
    "tasks/fetchOne",
    async (taskId, { rejectWithValue }) => {
        try {
            return await tasksService.get(taskId)
        } catch (err: any) {
            return rejectWithValue(err.detail ?? "Failed to load task")
        }
    },
)

export const cancelTask = createAsyncThunk<string, string>(
    "tasks/cancel",
    async (taskId, { rejectWithValue }) => {
        try {
            await tasksService.cancel(taskId)
            return taskId
        } catch (err: any) {
            return rejectWithValue(err.detail ?? "Failed to cancel task")
        }
    },
)

export const deleteTask = createAsyncThunk<string, string>(
    "tasks/delete",
    async (taskId, { rejectWithValue }) => {
        try {
            await tasksService.delete(taskId)
            return taskId
        } catch (err: any) {
            return rejectWithValue(err.detail ?? "Failed to delete task")
        }
    },
)

// ── Helpers ───────────────────────────────────────────────────

function upsertTask(state: TasksState, task: TaskStatusResponse) {
    const isNew = !(task.task_id in state.tasks)
    state.tasks[task.task_id] = task
    if (isNew) {
        // Newest first
        state.orderedIds.unshift(task.task_id)
    }
}

// ── Slice ─────────────────────────────────────────────────────

const tasksSlice = createSlice({
    name: "tasks",
    initialState,
    reducers: {
        /** Called from SSE stream events to apply incremental progress updates */
        applySSEUpdate(state, action: PayloadAction<TaskSSEEvent>) {
            const ev = action.payload
            const existing = state.tasks[ev.task_id]
            if (existing) {
                existing.status = ev.status
                existing.stage = ev.stage
                existing.stage_label = ev.stage_label
                existing.pct = ev.pct
                existing.nodes_done = ev.nodes_done
                existing.total_nodes = ev.total_nodes
                existing.eta_seconds = ev.eta_seconds
                existing.current_node = ev.current_node
                existing.elapsed_seconds = ev.elapsed_s
                existing.error = ev.error
            }
        },
        /** Mark a task as actively streaming (used to prevent duplicate streams) */
        markStreaming(state, action: PayloadAction<string>) {
            state.activeStreamIds.add(action.payload)
        },
        markStreamClosed(state, action: PayloadAction<string>) {
            state.activeStreamIds.delete(action.payload)
        },
        /** Insert a freshly accepted task (immediately after upload) */
        addPendingTask(state, action: PayloadAction<TaskStatusResponse>) {
            upsertTask(state, action.payload)
        },
    },
    extraReducers: (builder) => {
        // ── fetchTasks ─────────────────────────────────────────
        builder
            .addCase(fetchTasks.pending, (state) => {
                state.listStatus = "loading"
                state.listError = null
            })
            .addCase(fetchTasks.fulfilled, (state, action) => {
                state.listStatus = "succeeded"
                // Merge — don't replace, to preserve streaming tasks not in list
                for (const task of action.payload.tasks) {
                    upsertTask(state, task)
                }
            })
            .addCase(fetchTasks.rejected, (state, action) => {
                state.listStatus = "failed"
                state.listError = action.payload as string
            })

        // ── fetchTask ──────────────────────────────────────────
        builder.addCase(fetchTask.fulfilled, (state, action) => {
            upsertTask(state, action.payload)
        })

        // ── cancelTask ─────────────────────────────────────────
        builder.addCase(cancelTask.fulfilled, (state, action) => {
            const task = state.tasks[action.payload]
            if (task) task.status = "cancelled"
        })

        // ── deleteTask ─────────────────────────────────────────
        builder.addCase(deleteTask.fulfilled, (state, action) => {
            const taskId = action.payload
            delete state.tasks[taskId]
            state.orderedIds = state.orderedIds.filter((id) => id !== taskId)
        })
    },
})

export const {
    applySSEUpdate,
    markStreaming,
    markStreamClosed,
    addPendingTask,
} = tasksSlice.actions

export default tasksSlice.reducer

// ── Selectors ─────────────────────────────────────────────────

export const selectAllTasks = (s: RootState): TaskStatusResponse[] =>
    s.tasks.orderedIds.map((id) => s.tasks.tasks[id]).filter(Boolean)

export const selectTask = (taskId: string) => (s: RootState) =>
    s.tasks.tasks[taskId] ?? null

export const selectActiveTasks = (s: RootState): TaskStatusResponse[] =>
    selectAllTasks(s).filter((t) => !["done", "failed", "cancelled"].includes(t.status))

export const selectTasksListStatus = (s: RootState) => s.tasks.listStatus
export const selectTasksListError = (s: RootState) => s.tasks.listError