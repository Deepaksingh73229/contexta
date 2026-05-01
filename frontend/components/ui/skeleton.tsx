import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-xl bg-neutral-200/80 dark:bg-neutral-800/50",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }