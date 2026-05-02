"use client"

import { useState } from "react"
import { AuthGuard } from "@/lib/providers"
import {AppSidebar} from "@/components/sidebar/app-sidebar"
import type { Permission } from "@/types"

interface AppShellProps {
    children: React.ReactNode
    requiredPermission?: Permission
}

export function AppShell({ children, requiredPermission }: AppShellProps) {
    const [collapsed, setCollapsed] = useState(false)

    return (
        <AuthGuard requiredPermission={requiredPermission}>
            {/* 
              1. Root Canvas
              We use a very subtle off-white/pure-black background here.
              This acts as the "canvas" so the main content card pops out.
            */}
            <div className="flex h-screen w-full overflow-hidden bg-[#FAFAFA] dark:bg-black selection:bg-violet-500/30">

                {/* Sidebar functionality remains completely unchanged */}
                <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

                {/* 
                  2. The Inset Main Content Card
                  Notice the `my-2 mr-2` (margins) and `rounded-2xl` which creates 
                  the modern floating "app within an app" aesthetic.
                */}
                <main className="
                    flex flex-col flex-1 
                    min-w-0 
                    h-[calc(100vh-16px)] /* Accounts for the 8px top + 8px bottom margins */
                    my-2 mr-2 ml-0 sm:ml-2
                    bg-white dark:bg-[#0A0A0A]
                    rounded-2xl sm:rounded-[24px] 
                    ring-1 ring-inset ring-neutral-200/50 dark:ring-white/10
                    shadow-sm shadow-neutral-200/40 dark:shadow-none
                    overflow-hidden relative
                    transition-all duration-300 ease-out
                ">
                    {/* 3. Micro-Interaction: Top inner highlight line for subtle 3D depth */}
                    <div
                        className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-neutral-100 dark:via-white/5 to-transparent z-10 pointer-events-none"
                        aria-hidden="true"
                    />

                    {/* 4. Refined Scroll Area */}
                    <div className="
                        flex-1 overflow-y-auto 
                        scrollbar-thin scrollbar-thumb-neutral-200 hover:scrollbar-thumb-neutral-300 
                        dark:scrollbar-thumb-neutral-800 dark:hover:scrollbar-thumb-neutral-700 
                        scrollbar-track-transparent scroll-smooth
                    ">
                        {children}
                    </div>
                </main>
            </div>
        </AuthGuard>
    )
}