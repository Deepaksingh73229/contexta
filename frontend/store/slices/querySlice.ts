// ============================================================
// store/slices/querySlice.ts
// RAG query state — history, current result, documents, cache.
// ============================================================

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit"
import { queryService } from "@/services"
import type {
    QueryResponse,
    DocumentInfo,
    CacheStatsResponse,
} from "@/types"
import type { RootState } from "../store"

// ── State ─────────────────────────────────────────────────────

export interface QueryHistoryEntry {
    id: string                    // client-side uuid for keying
    query: string
    response: QueryResponse
    timestamp: number
}

interface QueryState {
    // Current query
    currentQuery: string
    currentResult: QueryResponse | null
    queryStatus: "idle" | "loading" | "succeeded" | "failed"
    queryError: string | null

    // Query history (most recent first, max 50)
    history: QueryHistoryEntry[]

    // Document list
    documents: DocumentInfo[]
    documentsStatus: "idle" | "loading" | "succeeded" | "failed"

    // Scoped document selection (empty = search all)
    selectedDocIds: string[]

    // Cache stats
    cacheStats: CacheStatsResponse | null

    // UI state
    isSidebarOpen: boolean
}

const initialState: QueryState = {
    currentQuery: "",
    currentResult: null,
    queryStatus: "idle",
    queryError: null,
    history: [],
    documents: [],
    documentsStatus: "idle",
    selectedDocIds: [],
    cacheStats: null,
    isSidebarOpen: true,
}

// ── Thunks ────────────────────────────────────────────────────

export const runQuery = createAsyncThunk<
    { response: QueryResponse; query: string },
    { query: string; docIds?: string[] }
>(
    "query/run",
    async ({ query, docIds }, { rejectWithValue }) => {
        try {
            const response = await queryService.ask(query, docIds)
            return { response, query }
        } catch (err: any) {
            return rejectWithValue(err.detail ?? "Query failed")
        }
    },
)

export const fetchDocuments = createAsyncThunk<DocumentInfo[], void>(
    "query/fetchDocuments",
    async (_, { rejectWithValue }) => {
        try {
            const res = await queryService.listDocuments()
            return res.documents
        } catch (err: any) {
            return rejectWithValue(err.detail ?? "Failed to load documents")
        }
    },
)

export const fetchCacheStats = createAsyncThunk<CacheStatsResponse, void>(
    "query/fetchCacheStats",
    async (_, { rejectWithValue }) => {
        try {
            return await queryService.cacheStats()
        } catch (err: any) {
            return rejectWithValue(err.detail ?? "Failed to load cache stats")
        }
    },
)

export const clearCache = createAsyncThunk<void, void>(
    "query/clearCache",
    async (_, { rejectWithValue, dispatch }) => {
        try {
            await queryService.clearCache()
            dispatch(fetchCacheStats())
        } catch (err: any) {
            return rejectWithValue(err.detail ?? "Failed to clear cache")
        }
    },
)

// ── Slice ─────────────────────────────────────────────────────

const MAX_HISTORY = 50

const querySlice = createSlice({
    name: "query",
    initialState,
    reducers: {
        setCurrentQuery(state, action: PayloadAction<string>) {
            state.currentQuery = action.payload
        },
        clearCurrentResult(state) {
            state.currentResult = null
            state.queryStatus = "idle"
            state.queryError = null
        },
        toggleDocSelection(state, action: PayloadAction<string>) {
            const id = action.payload
            const idx = state.selectedDocIds.indexOf(id)
            if (idx === -1) {
                state.selectedDocIds.push(id)
            } else {
                state.selectedDocIds.splice(idx, 1)
            }
        },
        clearDocSelection(state) {
            state.selectedDocIds = []
        },
        selectAllDocs(state) {
            state.selectedDocIds = state.documents.map((d) => d.doc_id)
        },
        toggleSidebar(state) {
            state.isSidebarOpen = !state.isSidebarOpen
        },
        clearHistory(state) {
            state.history = []
        },
        removeHistoryEntry(state, action: PayloadAction<string>) {
            state.history = state.history.filter((h) => h.id !== action.payload)
        },
        /** Restore a previous query result as the current result */
        restoreHistoryEntry(state, action: PayloadAction<string>) {
            const entry = state.history.find((h) => h.id === action.payload)
            if (entry) {
                state.currentQuery = entry.query
                state.currentResult = entry.response
                state.queryStatus = "succeeded"
            }
        },
    },
    extraReducers: (builder) => {
        // ── runQuery ───────────────────────────────────────────
        builder
            .addCase(runQuery.pending, (state) => {
                state.queryStatus = "loading"
                state.queryError = null
                state.currentResult = null
            })
            .addCase(runQuery.fulfilled, (state, action) => {
                state.queryStatus = "succeeded"
                state.currentResult = action.payload.response

                // Add to history
                const entry: QueryHistoryEntry = {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    query: action.payload.query,
                    response: action.payload.response,
                    timestamp: Date.now(),
                }
                state.history.unshift(entry)
                if (state.history.length > MAX_HISTORY) {
                    state.history = state.history.slice(0, MAX_HISTORY)
                }
            })
            .addCase(runQuery.rejected, (state, action) => {
                state.queryStatus = "failed"
                state.queryError = action.payload as string
            })

        // ── fetchDocuments ─────────────────────────────────────
        builder
            .addCase(fetchDocuments.pending, (state) => {
                state.documentsStatus = "loading"
            })
            .addCase(fetchDocuments.fulfilled, (state, action) => {
                state.documentsStatus = "succeeded"
                state.documents = action.payload
            })
            .addCase(fetchDocuments.rejected, (state) => {
                state.documentsStatus = "failed"
            })

        // ── fetchCacheStats ────────────────────────────────────
        builder.addCase(fetchCacheStats.fulfilled, (state, action) => {
            state.cacheStats = action.payload
        })
    },
})

export const {
    setCurrentQuery,
    clearCurrentResult,
    toggleDocSelection,
    clearDocSelection,
    selectAllDocs,
    toggleSidebar,
    clearHistory,
    removeHistoryEntry,
    restoreHistoryEntry,
} = querySlice.actions

export default querySlice.reducer

// ── Selectors ─────────────────────────────────────────────────

export const selectCurrentQuery = (s: RootState) => s.query.currentQuery
export const selectCurrentResult = (s: RootState) => s.query.currentResult
export const selectQueryStatus = (s: RootState) => s.query.queryStatus
export const selectQueryError = (s: RootState) => s.query.queryError
export const selectQueryHistory = (s: RootState) => s.query.history
export const selectDocuments = (s: RootState) => s.query.documents
export const selectDocumentsStatus = (s: RootState) => s.query.documentsStatus
export const selectSelectedDocIds = (s: RootState) => s.query.selectedDocIds
export const selectCacheStats = (s: RootState) => s.query.cacheStats
export const selectIsSidebarOpen = (s: RootState) => s.query.isSidebarOpen
export const selectIsQuerying = (s: RootState) => s.query.queryStatus === "loading"