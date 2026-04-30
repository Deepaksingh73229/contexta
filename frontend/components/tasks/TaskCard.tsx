// components/tasks/TaskCard.tsx
"use client"

import { useEffect } from "react"
import { FileText, X, Trash2, AlertCircle, CheckCircle2, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { cancelTask, deleteTask, selectTask } from "@/store/slices/tasksSlice"
import { useTaskStream } from "@/lib/hooks"
import { usePermission } from "@/lib/hooks"
import {
    STATUS_COLORS, STATUS_LABELS, formatDuration, formatEta,
    isTerminalStatus,
} from "@/utils"
import { cn } from "@/utils/cn"
import type { TaskStatus } from "@/types"

interface TaskCardProps {
    taskId: string
}

const STATUS_ICON: Record<TaskStatus, React.ElementType | null> = {
    queued: Clock,
    running: null,
    done: CheckCircle2,
    failed: AlertCircle,
    cancelled: X,
    interrupted: AlertCircle,
}

export function TaskCard({ taskId }: TaskCardProps) {
    const dispatch = useAppDispatch()
    const task = useAppSelector(selectTask(taskId))
    const { canCancelTasks } = usePermission()

    // Stream live updates into Redux
    useTaskStream(task?.status && !isTerminalStatus(task.status) ? taskId : null)

    if (!task) return null

    const terminal = isTerminalStatus(task.status)
    const Icon = STATUS_ICON[task.status]

    return (
        <div className={cn(
            "rounded-xl border border-border bg-card p-4 space-y-3 transition-all",
            task.status === "done" && "border-emerald-200 dark:border-emerald-800",
            task.status === "failed" && "border-destructive/40",
        )}>
            {/* Header */}
            <div className="flex items-start gap-3">
                <div className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    task.status === "done" ? "bg-emerald-100 dark:bg-emerald-900/30" :
                        task.status === "failed" ? "bg-destructive/10" : "bg-muted",
                )}>
                    <FileText className={cn(
                        "h-4 w-4",
                        task.status === "done" ? "text-emerald-600 dark:text-emerald-400" :
                            task.status === "failed" ? "text-destructive" : "text-muted-foreground",
                    )} />
                </div>

                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{task.filename}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                        <Badge
                            variant="outline"
                            className={cn("h-5 gap-1 text-[11px] px-1.5", STATUS_COLORS[task.status])}
                        >
                            {Icon && <Icon className="h-3 w-3" />}
                            {/* Running pulse dot */}
                            {task.status === "running" && (
                                <span className="pulse-dot" />
                            )}
                            {STATUS_LABELS[task.status]}
                        </Badge>

                        {task.status === "running" && task.total_nodes > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                                {task.nodes_done}/{task.total_nodes} sections
                            </span>
                        )}

                        {terminal && task.elapsed_seconds > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                                {formatDuration(task.elapsed_seconds)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 gap-1">
                    {!terminal && canCancelTasks && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => dispatch(cancelTask(taskId))}
                            aria-label="Cancel task"
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    )}
                    {terminal && canCancelTasks && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => dispatch(deleteTask(taskId))}
                            aria-label="Delete task"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Progress bar (running only) */}
            {task.status === "running" && (
                <div className="space-y-1.5">
                    <Progress value={task.pct} className="h-1.5" />
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground truncate max-w-[70%]">
                            {task.stage_label}
                            {task.current_node && (
                                <span className="ml-1 text-muted-foreground/60">— {task.current_node}</span>
                            )}
                        </p>
                        <p className="text-[11px] text-muted-foreground shrink-0 ml-2">
                            {task.pct.toFixed(0)}% · {formatEta(task.eta_seconds)}
                        </p>
                    </div>
                </div>
            )}

            {/* Error */}
            {task.status === "failed" && task.error && (
                <p className="text-xs text-destructive bg-destructive/5 rounded-md px-2 py-1.5">
                    {task.error}
                </p>
            )}
        </div>
    )
}