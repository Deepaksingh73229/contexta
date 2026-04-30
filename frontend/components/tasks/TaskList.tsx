// components/tasks/TaskList.tsx
"use client"

import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { fetchTasks, selectAllTasks, selectTasksListStatus } from "@/store/slices/tasksSlice"
import { TaskCard } from "./TaskCard"
import { Skeleton } from "@/components/ui/skeleton"
import { InboxIcon } from "lucide-react"

export function TaskList() {
    const dispatch = useAppDispatch()
    const tasks = useAppSelector(selectAllTasks)
    const status = useAppSelector(selectTasksListStatus)

    useEffect(() => {
        dispatch(fetchTasks(true))
    }, [dispatch])

    if (status === "loading" && tasks.length === 0) {
        return (
            <div className="space-y-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
        )
    }

    if (tasks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
                <InboxIcon className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">No ingestion tasks yet</p>
                <p className="text-xs text-muted-foreground mt-1">Upload a PDF to get started</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {tasks.map((task) => <TaskCard key={task.task_id} taskId={task.task_id} />)}
        </div>
    )
}