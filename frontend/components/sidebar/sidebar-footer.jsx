import Image from "next/image"
import { LogOut, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useAuth } from "@/lib/hooks"
import { cn } from "@/utils/cn"

import profile from "@/public/boy.png"

export function SidebarFooter({ collapsed }) {
    const { theme, setTheme } = useTheme()
    const { user, logout } = useAuth()

    return (
        <div className="mt-auto p-3 relative z-20">
            {!user && null}

            <div className="relative group">
                {/* Profile Card */}
                <div
                    className={cn(
                        "flex items-center gap-5 rounded-xl p-2.5 cursor-pointer",
                        "transition-all duration-200",
                        "hover:bg-neutral-100 dark:hover:bg-white/5",
                        collapsed && "justify-center"
                    )}
                >
                    <Image
                        src={profile}
                        alt="profile"
                        loading="lazy"
                        className="w-10"
                    />

                    {!collapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                                {user.username}
                            </p>

                            <p className="text-xs text-neutral-500 dark:text-neutral-400 capitalize truncate">
                                {user.role}
                            </p>
                        </div>
                    )}
                </div>

                {/* Hover Popup */}
                <div
                    className={cn(
                        "absolute left-0 bottom-14 w-56",
                        "opacity-0 invisible translate-y-2",
                        "group-hover:opacity-100 group-hover:visible group-hover:translate-y-0",
                        "transition-all duration-200 ease-out",
                        "z-50"
                    )}
                >
                    <div className="
                        rounded-xl p-2
                        bg-white dark:bg-neutral-900
                        border border-neutral-200/70 dark:border-white/10
                        shadow-lg
                        backdrop-blur-xl"
                    >
                        {/* Theme Toggle */}
                        <button
                            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            className="
                                flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm
                                text-neutral-700 dark:text-neutral-300
                                hover:bg-neutral-100 dark:hover:bg-white/10
                                transition
                            "
                        >
                            <Sun className="size-4 dark:hidden" />
                            <Moon className="hidden size-4 dark:block" />
                            Toggle Theme
                        </button>

                        {/* Logout */}
                        <button
                            onClick={logout}
                            className="
                                flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm
                                text-neutral-700 dark:text-neutral-300
                                hover:bg-rose-50 dark:hover:bg-rose-500/10
                                hover:text-rose-600 dark:hover:text-rose-400
                                transition"
                        >
                            <LogOut className="size-4" />
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}