"use client";

import * as React from "react";
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
                "relative h-10 w-10 rounded-xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800",
                "text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400",
                "hover:bg-zinc-50 dark:hover:bg-zinc-900 shadow-sm transition-all duration-300",
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