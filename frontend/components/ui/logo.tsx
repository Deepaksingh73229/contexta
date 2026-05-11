import Image from "next/image"
import { cn } from "@/lib/utils"

import logo from "@/public/logo.png"

interface ContextaLogoProps {
    className?: string;
    size?: "sm" | "md" | "lg";
}

export function ContextaLogo({ className, size = "md" }: ContextaLogoProps) {
    const sizeClasses = {
        sm: "w-8 h-8",
        md: "w-12 h-12",
        lg: "w-16 h-16"
    };

    return (
        <Image
            src={logo}
            alt="contexta-logo"
            loading="lazy"
            className={cn(sizeClasses[size], className)}
        />
    )
}