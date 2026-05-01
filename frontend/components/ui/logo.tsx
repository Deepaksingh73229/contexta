import * as React from "react"
import { cn } from "@/lib/utils"

interface LogoProps extends React.SVGProps<SVGSVGElement> {
    variant?: "default" | "monochrome"
    size?: "sm" | "md" | "lg" | "xl"
}

export function ContextaLogo({
    className,
    variant = "default",
    size = "md",
    ...props
}: LogoProps) {
    // Size mappings for perfect scaling
    const sizeClasses = {
        sm: "size-5",   // For sidebar collapsed state
        md: "size-8",   // For top nav / sidebar expanded
        lg: "size-14",  // For login page brand header
        xl: "size-24",  // For hero sections
    }

    return (
        <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("shrink-0", sizeClasses[size], className)}
            {...props}
        >
            {variant === "default" && (
                <defs>
                    <linearGradient id="contexta-main" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#8B5CF6" /> {/* violet-500 */}
                        <stop offset="100%" stopColor="#9333EA" /> {/* purple-600 */}
                    </linearGradient>
                    <linearGradient id="contexta-accent" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#A78BFA" /> {/* violet-400 */}
                        <stop offset="100%" stopColor="#C084FC" /> {/* fuchsia-400 */}
                    </linearGradient>
                </defs>
            )}

            {/* The Data Arc (Outer 'C') */}
            <path
                d="M 65 20 C 40 10 15 25 15 50 C 15 75 40 90 65 80"
                stroke={variant === "default" ? "url(#contexta-main)" : "currentColor"}
                strokeWidth="14"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* The Context Arc (Inner sweeping line) */}
            <path
                d="M 28 50 C 28 35 40 28 50 32"
                stroke={variant === "default" ? "url(#contexta-accent)" : "currentColor"}
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={variant === "default" ? "opacity-80" : "opacity-50"}
            />

            {/* The AI Spark (The extracted answer) */}
            <path
                d="M 85 50 C 75 50 70 45 70 35 C 70 45 65 50 55 50 C 65 50 70 55 70 65 C 70 55 75 50 85 50 Z"
                fill={variant === "default" ? "url(#contexta-accent)" : "currentColor"}
            />
        </svg>
    )
}