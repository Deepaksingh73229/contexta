// ============================================================
// lib/hooks/useQuery.ts
// RAG query state hook — submit queries, track history, documents.
// ============================================================

"use client"

import { useCallback, useEffect } from "react"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import {
    runQuery,
    fetchDocuments,
    fetchCacheStats,
    clearCache,
    setCurrentQuery,
    clearCurrentResult,
    toggleDocSelection,
    clearDocSelection,
    selectAllDocs,
    toggleSidebar,
    clearHistory,
    removeHistoryEntry,
    restoreHistoryEntry,
    selectCurrentQuery,
    selectCurrentResult,
    selectQueryStatus,
    selectQueryError,
    selectQueryHistory,
    selectDocuments,
    selectDocumentsStatus,
    selectSelectedDocIds,
    selectCacheStats,
    selectIsSidebarOpen,
    selectIsQuerying,
} from "@/store/slices/querySlice"

export function useQuery() {
    const dispatch = useAppDispatch()

    const currentQuery = useAppSelector(selectCurrentQuery)
    const currentResult = useAppSelector(selectCurrentResult)
    const status = useAppSelector(selectQueryStatus)
    const error = useAppSelector(selectQueryError)
    const history = useAppSelector(selectQueryHistory)
    const documents = useAppSelector(selectDocuments)
    const documentsStatus = useAppSelector(selectDocumentsStatus)
    const selectedDocIds = useAppSelector(selectSelectedDocIds)
    const cacheStats = useAppSelector(selectCacheStats)
    const isSidebarOpen = useAppSelector(selectIsSidebarOpen)
    const isQuerying = useAppSelector(selectIsQuerying)

    // Load documents on first use
    useEffect(() => {
        if (documentsStatus === "idle") {
            dispatch(fetchDocuments())
        }
    }, [documentsStatus, dispatch])

    const submitQuery = useCallback(
        (query: string) => {
            if (!query.trim() || isQuerying) return
            dispatch(runQuery({ query: query.trim(), docIds: selectedDocIds }))
        },
        [dispatch, selectedDocIds, isQuerying],
    )

    return {
        // State
        currentQuery,
        currentResult,
        status,
        error,
        history,
        documents,
        documentsStatus,
        selectedDocIds,
        cacheStats,
        isSidebarOpen,
        isQuerying,
        isLoading: status === "loading",
        hasResult: !!currentResult,

        // Query actions
        setQuery: (q: string) => dispatch(setCurrentQuery(q)),
        submitQuery,
        clearResult: () => dispatch(clearCurrentResult()),

        // Document selection
        toggleDoc: (docId: string) => dispatch(toggleDocSelection(docId)),
        clearDocSelection: () => dispatch(clearDocSelection()),
        selectAllDocs: () => dispatch(selectAllDocs()),

        // History
        clearHistory: () => dispatch(clearHistory()),
        removeHistory: (id: string) => dispatch(removeHistoryEntry(id)),
        restoreHistory: (id: string) => dispatch(restoreHistoryEntry(id)),

        // Cache
        loadCacheStats: () => dispatch(fetchCacheStats()),
        clearCache: () => dispatch(clearCache()),

        // UI
        toggleSidebar: () => dispatch(toggleSidebar()),

        // Helpers
        refreshDocuments: () => dispatch(fetchDocuments()),
    }
}