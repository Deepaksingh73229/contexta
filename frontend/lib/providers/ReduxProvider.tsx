// ============================================================
// lib/providers/ReduxProvider.tsx
// Wraps children with the Redux store provider.
// Must be a Client Component — placed in root layout.
// ============================================================

"use client"

import { useEffect } from "react"
import { Provider } from "react-redux"
import { store } from "@/store/store"
import { hydrateAuth } from "@/store/slices/authSlice"
import { authService } from "@/services"

export function ReduxProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        store.dispatch(
            hydrateAuth({
                user: authService.getCachedUser(),
                isAuthenticated: authService.isAuthenticated(),
            }),
        )
    }, [])

    return <Provider store={store}>{children}</Provider>
}
