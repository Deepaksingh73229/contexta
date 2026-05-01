"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-[13px] font-semibold leading-none text-neutral-700 dark:text-neutral-300 select-none transition-colors duration-200 ease-out",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        // Optional: If you want labels to turn red when their peer input is invalid
        "peer-aria-invalid:text-rose-600 dark:peer-aria-invalid:text-rose-400",
        className
      )}
      {...props}
    />
  )
}

export { Label }