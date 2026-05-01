// ============================================================
// services/query.service.ts
// RAG query, document listing, and cache management.
// ============================================================

import { apiClient } from "@/lib/api-client"
import { ENDPOINTS } from "@/config/api.config"
import type {
    QueryRequest,
    QueryResponse,
    DocumentListResponse,
    CacheStatsResponse,
} from "@/types"

export const queryService = {
    /**
     * Run a natural-language query against the knowledge base.
     * Triggers the full multi-agent RAG pipeline:
     * Intent → Rewrite → Planner → FAISS → Hybrid score → Synthesis
     *
     * @param query - The user's question (1–2000 chars)
     * @param docIds - Optional array of doc_ids to scope the search.
     *                 Pass [] or omit to search all documents.
     */
    ask: (query: string, docIds?: string[]): Promise<QueryResponse> =>
        apiClient.post<QueryResponse>(
            ENDPOINTS.QUERY.SEARCH,
            { query, doc_ids: docIds ?? [] } satisfies QueryRequest,
            { timeout: 60_000 },
        ),

    /**
     * List all ingested documents with their node counts.
     */
    listDocuments: (): Promise<DocumentListResponse> =>
        apiClient.get<DocumentListResponse>(ENDPOINTS.QUERY.DOCUMENTS),

    /**
     * Get query cache statistics.
     */
    cacheStats: (): Promise<CacheStatsResponse> =>
        apiClient.get<CacheStatsResponse>(ENDPOINTS.QUERY.CACHE_STATS),

    /**
     * Clear the query cache and in-memory index cache (admin/manager only).
     */
    clearCache: (): Promise<{ status: string; message: string }> =>
        apiClient.delete(ENDPOINTS.QUERY.CACHE_CLEAR),
}