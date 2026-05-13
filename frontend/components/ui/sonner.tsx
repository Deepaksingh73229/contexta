'use client'

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white/95 group-[.toaster]:dark:bg-[#0A0A0A]/95 group-[.toaster]:backdrop-blur-2xl group-[.toaster]:text-neutral-900 group-[.toaster]:dark:text-neutral-100 group-[.toaster]:border-0 group-[.toaster]:ring-1 group-[.toaster]:ring-inset group-[.toaster]:ring-neutral-200/80 group-[.toaster]:dark:ring-white/10 group-[.toaster]:shadow-2xl group-[.toaster]:shadow-black/10 group-[.toaster]:dark:shadow-black/50 group-[.toaster]:rounded-xl font-sans",
          title: "text-[14px] font-semibold",
          description:
            "group-[.toast]:text-[13px] group-[.toast]:text-neutral-500 group-[.toast]:dark:text-neutral-400 group-[.toast]:leading-relaxed",
          actionButton:
            "group-[.toast]:bg-neutral-900 group-[.toast]:text-white group-[.toast]:dark:bg-white group-[.toast]:dark:text-neutral-900 group-[.toast]:text-[13px] group-[.toast]:font-semibold group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 transition-transform active:scale-95",
          cancelButton:
            "group-[.toast]:bg-neutral-100 group-[.toast]:text-neutral-600 group-[.toast]:dark:bg-neutral-800 group-[.toast]:dark:text-neutral-300 group-[.toast]:text-[13px] group-[.toast]:font-semibold group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 transition-transform active:scale-95",
          icon: "group-data-[type=error]:text-rose-600 dark:group-data-[type=error]:text-rose-400 group-data-[type=success]:text-emerald-600 dark:group-data-[type=success]:text-emerald-400 group-data-[type=warning]:text-amber-600 dark:group-data-[type=warning]:text-amber-400 group-data-[type=info]:text-blue-600 dark:group-data-[type=info]:text-blue-400",
        },
      }}
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      {...props}
    />
  )
}

export { Toaster }