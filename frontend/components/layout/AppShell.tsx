// components/layout/AppShell.tsx
"use client"

import { useState } from "react"
import { AuthGuard } from "@/lib/providers"
import { AppSidebar } from "./AppSidebar"
import type { Permission } from "@/types"

interface AppShellProps {
    children: React.ReactNode
    requiredPermission?: Permission
}

export function AppShell({ children, requiredPermission }: AppShellProps) {
    const [collapsed, setCollapsed] = useState(false)

    return (
        <AuthGuard requiredPermission={requiredPermission}>
            <div className="flex h-screen overflow-hidden bg-background">
                <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
                <main className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto scrollbar-thin">
                        {children}
                    </div>
                </main>
            </div>
        </AuthGuard>
    )
}