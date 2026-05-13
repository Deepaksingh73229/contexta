"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }) {
    const { theme, setTheme } = useTheme();

    return (
        <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={cn(
                "relative h-10 w-10 rounded-xl bg-neutral-100/20 dark:bg-neutral-500/20 border-neutral-500 dark:border-neutral-800",
                "text-amber-700 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-amber-400",
                "hover:bg-neutral-50 dark:hover:bg-neutral-900 shadow-sm transition-all duration-300",
                "active:scale-95 overflow-hidden",
                className
            )}
        >
            {/* Sun Icon: Hides smoothly when switching to dark mode */}
            <Sun className="absolute h-5 w-5 rotate-0 scale-100 opacity-100 transition-all duration-500 dark:-rotate-90 dark:scale-0 dark:opacity-0" />

            {/* Moon Icon: Appears smoothly when switching to dark mode */}
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 opacity-0 transition-all duration-500 dark:rotate-0 dark:scale-100 dark:opacity-100" />

            <span className="sr-only">Toggle theme</span>
        </Button>
    );
}