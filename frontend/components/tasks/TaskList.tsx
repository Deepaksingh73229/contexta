"use client"

import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { fetchTasks, selectAllTasks, selectTasksListStatus } from "@/store/slices/tasksSlice"
import { TaskCard } from "./TaskCard"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"

export function TaskList() {
    const dispatch = useAppDispatch()
    const tasks = useAppSelector(selectAllTasks)
    const status = useAppSelector(selectTasksListStatus)

    useEffect(() => {
        dispatch(fetchTasks(true))
    }, [dispatch])

    if (status === "loading" && tasks.length === 0) {
        return (
            <div className="space-y-4 animate-in fade-in duration-300">
                {[1, 2, 3].map((i) => (
                    <Skeleton
                        key={i}
                        className="h-[104px] w-full rounded-2xl bg-neutral-200/50 dark:bg-neutral-800/50"
                    />
                ))}
            </div>
        )
    }

    if (tasks.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20 transition-colors">
                <EmptyState
                    icon={Activity}
                    title="No active tasks"
                    description="Upload a PDF document to start processing and building your vector knowledge base."
                    className="min-h-[250px] py-10"
                />
            </div>
        )
    }

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            {tasks.map((task) => (
                <TaskCard key={task.task_id} taskId={task.task_id} />
            ))}
        </div>
    )
}