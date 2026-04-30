// ============================================================
// store/hooks/index.ts
// Typed wrappers around useDispatch and useSelector.
// Import ONLY from here — never from react-redux directly.
// ============================================================

import {
    useDispatch,
    useSelector,
    type TypedUseSelectorHook,
} from "react-redux"
import type { RootState, AppDispatch } from "../store"

export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector