import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-5 shrink-0 rounded-md transition-all duration-200 ease-out active:scale-95 outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",

        // Unchecked / Base State
        "bg-white dark:bg-neutral-900 ring-1 ring-inset ring-neutral-200/80 dark:ring-white/10 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:ring-neutral-300 dark:hover:ring-white/20",

        // Checked State
        "data-[state=checked]:bg-violet-600 data-[state=checked]:ring-violet-600 data-[state=checked]:text-white data-[state=checked]:shadow-sm data-[state=checked]:shadow-violet-500/20 dark:data-[state=checked]:bg-violet-600 dark:data-[state=checked]:ring-violet-600",

        // Error State
        "aria-invalid:ring-rose-500/50 dark:aria-invalid:ring-rose-500/50 aria-invalid:bg-rose-50 dark:aria-invalid:bg-rose-500/10",

        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current animate-in zoom-in duration-200"
      >
        <CheckIcon className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }