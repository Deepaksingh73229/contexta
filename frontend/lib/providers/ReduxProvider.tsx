// ============================================================
// lib/providers/ReduxProvider.tsx
// Wraps children with the Redux store provider.
// Must be a Client Component — placed in root layout.
// ============================================================

"use client"

import { useRef } from "react"
import { Provider } from "react-redux"
import { store } from "@/store/store"

export function ReduxProvider({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>
}