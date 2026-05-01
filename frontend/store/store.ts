// ============================================================
// store/store.ts
// Redux Toolkit store — all slices wired together.
// ============================================================

import { configureStore } from "@reduxjs/toolkit"
import { enableMapSet } from "immer"

import authReducer from "./slices/authSlice"
import tasksReducer from "./slices/tasksSlice"
import queryReducer from "./slices/querySlice"

enableMapSet()

export const store = configureStore({
    reducer: {
        auth: authReducer,
        tasks: tasksReducer,
        query: queryReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            // Disable serializability check for Set (used in activeStreamIds)
            serializableCheck: {
                ignoredPaths: ["tasks.activeStreamIds"],
            },
        }),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch