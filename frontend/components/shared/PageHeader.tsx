import { cn } from "@/utils/cn"

interface PageHeaderProps {
    title: string
    description?: string
    action?: React.ReactNode
    className?: string
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
    return (
        <div className={cn(
            "flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500 ease-out",
            className
        )}>
            <div className="space-y-1.5 flex-1 min-w-0">
                <p className="text-5xl font-black tracking-tight text-violet-500/80">
                    {title}
                </p>

                {description && (
                    <p className="text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400 max-w-2xl">
                        {description}
                    </p>
                )}
            </div>
            {action && (
                <div className="shrink-0 flex items-center">
                    {action}
                </div>
            )}
        </div>
    )
}