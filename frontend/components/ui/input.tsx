import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0A0A0A] px-3.5 py-2 text-[14px] text-neutral-900 dark:text-neutral-100 shadow-sm transition-all duration-200 ease-out",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-neutral-900 dark:file:text-neutral-100",
        "placeholder:text-neutral-400 dark:placeholder:text-neutral-500",
        "focus-visible:outline-none focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/50 dark:focus-visible:border-violet-400 dark:focus-visible:ring-violet-400/50",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-rose-500 aria-invalid:ring-2 aria-invalid:ring-rose-500/20 dark:aria-invalid:border-rose-400 dark:aria-invalid:ring-rose-400/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }