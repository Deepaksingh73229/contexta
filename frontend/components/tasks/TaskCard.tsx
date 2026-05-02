"use client"

import { useEffect } from "react"
import { FileText, X, Trash2, AlertCircle, CheckCircle2, Clock, Activity, AlertTriangle } from "lucide-react"
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
    running: Activity,
    done: CheckCircle2,
    failed: AlertCircle,
    cancelled: X,
    interrupted: AlertCircle,
}

// SaaS-Modern card border and glow states
const CARD_STATE_STYLES: Record<string, string> = {
    queued: "ring-neutral-200/80 dark:ring-white/10",
    running: "ring-violet-300/60 dark:ring-violet-500/30 shadow-md shadow-violet-500/10 bg-white dark:bg-neutral-900/80",
    done: "ring-emerald-200/80 dark:ring-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10",
    failed: "ring-rose-200/80 dark:ring-rose-500/30 bg-rose-50/30 dark:bg-rose-950/10",
    cancelled: "ring-neutral-200/80 dark:ring-white/10 opacity-70 grayscale-[0.5]",
    interrupted: "ring-amber-200/80 dark:ring-amber-500/30",
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
            "relative overflow-hidden rounded-2xl p-5 space-y-4 transition-all duration-500 ease-out",
            "bg-white/80 dark:bg-[#0A0A0A]/60 backdrop-blur-xl ring-1 ring-inset",
            CARD_STATE_STYLES[task.status] || CARD_STATE_STYLES.queued
        )}>
            {/* Background glow for running tasks */}
            {task.status === "running" && (
                <div className="absolute -top-10 -right-10 size-32 rounded-full bg-violet-500/10 blur-3xl pointer-events-none animate-pulse" />
            )}

            {/* ── Header Area ────────────────────────────────────────────────── */}
            <div className="flex items-start gap-4 relative z-10">
                {/* File Icon */}
                <div className={cn(
                    "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl shadow-inner transition-colors duration-500",
                    task.status === "done" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" :
                        task.status === "failed" ? "bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400" :
                            task.status === "running" ? "bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400" :
                                "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                )}>
                    <FileText className="size-5" />
                </div>

                {/* Metadata */}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-neutral-900 dark:text-white mb-1.5">
                        {task.filename}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge
                            variant="outline"
                            className={cn(
                                "h-5 gap-1.5 text-[10px] px-2 font-bold uppercase tracking-wider border-0 shadow-sm",
                                STATUS_COLORS[task.status]
                            )}
                        >
                            {Icon && <Icon className={cn("size-3", task.status === "running" && "animate-spin-slow")} />}
                            {STATUS_LABELS[task.status]}
                        </Badge>

                        {task.status === "running" && task.total_nodes > 0 && (
                            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                                {task.nodes_done} / {task.total_nodes} nodes
                            </span>
                        )}

                        {terminal && task.elapsed_seconds > 0 && (
                            <span className="flex items-center gap-1 text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
                                <Clock className="size-3" />
                                {formatDuration(task.elapsed_seconds)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 gap-1 ml-2">
                    {!terminal && canCancelTasks && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors"
                            onClick={() => dispatch(cancelTask(taskId))}
                            aria-label="Cancel task"
                        >
                            <X className="size-4" />
                        </Button>
                    )}
                    {terminal && canCancelTasks && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                            onClick={() => dispatch(deleteTask(taskId))}
                            aria-label="Delete task log"
                        >
                            <Trash2 className="size-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Progress Section (Running only) ────────────────────────────── */}
            {task.status === "running" && (
                <div className="space-y-2.5 pt-1 relative z-10">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300 truncate max-w-[70%]">
                            {task.stage_label}
                            {task.current_node && (
                                <span className="ml-1 text-neutral-400 dark:text-neutral-500">— {task.current_node}</span>
                            )}
                        </p>
                        <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 shrink-0 ml-2">
                            <span className="font-bold text-violet-600 dark:text-violet-400 mr-1.5">{task.pct.toFixed(0)}%</span>
                            {formatEta(task.eta_seconds)}
                        </p>
                    </div>
                    {/* Progress Bar Container */}
                    <div className="h-1.5 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-violet-500 to-purple-600 dark:from-violet-400 dark:to-purple-500 transition-all duration-300 ease-out"
                            style={{ width: `${task.pct}%` }}
                        />
                    </div>
                </div>
            )}

            {/* ── Error State ────────────────────────────────────────────────── */}
            {task.status === "failed" && task.error && (
                <div className="flex items-start gap-2.5 mt-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-3.5 py-3 relative z-10">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <p className="text-[12px] font-medium text-rose-900 dark:text-rose-200 leading-relaxed">
                        {task.error}
                    </p>
                </div>
            )}
        </div>
    )
}