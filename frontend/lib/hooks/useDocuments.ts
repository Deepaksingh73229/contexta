// ============================================================
// lib/hooks/useDocuments.ts
// Document list state with refresh, selection helpers.
// ============================================================

"use client"

import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import {
    fetchDocuments,
    toggleDocSelection,
    clearDocSelection,
    selectAllDocs,
    selectDocuments,
    selectDocumentsStatus,
    selectSelectedDocIds,
} from "@/store/slices/querySlice"

export function useDocuments() {
    const dispatch = useAppDispatch()
    const documents = useAppSelector(selectDocuments)
    const status = useAppSelector(selectDocumentsStatus)
    const selectedIds = useAppSelector(selectSelectedDocIds)

    useEffect(() => {
        if (status === "idle") dispatch(fetchDocuments())
    }, [status, dispatch])

    const isSelected = (docId: string) => selectedIds.includes(docId)

    const toggle = (docId: string) => dispatch(toggleDocSelection(docId))

    const clear = () => dispatch(clearDocSelection())

    const selectAll = () => dispatch(selectAllDocs())

    return {
        documents,
        status,
        isLoading: status === "loading",
        selectedIds,
        isSelected,
        toggle,
        clear,
        selectAll,
        refresh: () => dispatch(fetchDocuments()),
        totalNodes: documents.reduce((acc, d) => acc + d.nodes, 0),
    }
}