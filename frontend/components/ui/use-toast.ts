"use client"

import { toast as sonnerToast, type ExternalToast } from "sonner"
import * as React from "react"

type ToastProps = ExternalToast & {
    title?: string | React.ReactNode
    description?: string | React.ReactNode
    variant?: "default" | "destructive" | "success" | "warning" | "info"
}

/**
 * An adapter that maps standard shadcn/ui toast calls to Sonner.
 * This allows you to keep your existing toast() calls throughout your app
 * without having to rewrite them all to sonnerToast().
 */
function toast({ title, description, variant = "default", ...props }: ToastProps) {
    // Map the "destructive" variant from standard shadcn to Sonner's error state
    if (variant === "destructive") {
        return sonnerToast.error(title, {
            description,
            ...props,
        })
    }

    if (variant === "success") {
        return sonnerToast.success(title, {
            description,
            ...props,
        })
    }

    if (variant === "warning") {
        return sonnerToast.warning(title, {
            description,
            ...props,
        })
    }

    if (variant === "info") {
        return sonnerToast.info(title, {
            description,
            ...props,
        })
    }

    // Default toast
    return sonnerToast(title, {
        description,
        ...props,
    })
}

/**
 * A hook wrapper to maintain backwards compatibility with standard shadcn/ui imports.
 */
function useToast() {
    return {
        toast,
        dismiss: sonnerToast.dismiss,
    }
}

export { useToast, toast }