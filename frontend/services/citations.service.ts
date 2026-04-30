// ============================================================
// services/citations.service.ts
// PDF citation streaming — builds URLs for inline rendering.
// ============================================================

import { apiClient, tokenStore } from "@/lib/api-client"
import { API_CONFIG, ENDPOINTS } from "@/config/api.config"

export const citationsService = {
    /**
     * Build a URL for embedding a PDF in an <iframe>.
     * Uses a token query param since iframe src can't set headers.
     *
     * @param docId  - 32-char hex document ID
     * @param page   - Optional 1-indexed page number (uses PDF fragment #page=N)
     *
     * @example
     * <iframe src={citationsService.iframeUrl(docId, 4)} />
     */
    iframeUrl: (docId: string, page?: number): string => {
        const token = tokenStore.getAccess()
        const path = ENDPOINTS.CITATIONS.PDF(docId)
        const base = `${API_CONFIG.BASE_URL}${path}`
        const fragment = page ? `#page=${page}` : ""
        // Append token as query param for iframe auth
        return token ? `${base}?token=${token}${fragment}` : `${base}${fragment}`
    },

    /**
     * Build a plain API URL (for direct fetch with Authorization header).
     */
    url: (docId: string): string =>
        apiClient.url(ENDPOINTS.CITATIONS.PDF(docId)),

    /**
     * Fetch the PDF as a Blob for rendering with PDF.js or saving.
     *
     * @example
     * const blob = await citationsService.fetchBlob(docId)
     * const blobUrl = URL.createObjectURL(blob)
     * // Remember to URL.revokeObjectURL(blobUrl) on cleanup
     */
    fetchBlob: async (docId: string): Promise<Blob> => {
        const token = tokenStore.getAccess()
        const res = await fetch(
            `${API_CONFIG.BASE_URL}${ENDPOINTS.CITATIONS.PDF(docId)}`,
            {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            },
        )
        if (!res.ok) {
            throw new Error(`Failed to fetch PDF: ${res.status} ${res.statusText}`)
        }
        return res.blob()
    },

    /**
     * Create a temporary blob URL for PDF display.
     * Returns both the URL and a revoke function to clean up memory.
     *
     * @example
     * const { url, revoke } = await citationsService.createBlobUrl(docId)
     * // use url in <iframe> or PDF.js
     * // cleanup:
     * revoke()
     */
    createBlobUrl: async (
        docId: string,
    ): Promise<{ url: string; revoke: () => void }> => {
        const blob = await citationsService.fetchBlob(docId)
        const url = URL.createObjectURL(blob)
        return { url, revoke: () => URL.revokeObjectURL(url) }
    },
}