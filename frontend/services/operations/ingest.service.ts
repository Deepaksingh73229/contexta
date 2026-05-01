// ============================================================
// services/ingest.service.ts
// Document upload and ingestion API calls.
// ============================================================

import { apiClient } from "@/lib/api-client"
import { ENDPOINTS } from "@/config/api.config"
import type { TaskAcceptedResponse } from "@/types"

export const ingestService = {
    /**
     * Upload a PDF file and start background ingestion.
     * Returns a task_id immediately — use tasksService.stream()
     * or tasksService.poll() to track progress.
     *
     * @param file - The PDF File object from an <input type="file">
     */
    uploadPDF: async (file: File): Promise<TaskAcceptedResponse> => {
        const form = new FormData()
        form.append("file", file, file.name)
        return apiClient.upload<TaskAcceptedResponse>(ENDPOINTS.INGEST.UPLOAD, form)
    },

    /**
     * Liveness probe for the ingestion service.
     */
    health: (): Promise<{ status: string; message: string }> =>
        apiClient.get(ENDPOINTS.INGEST.HEALTH, { skipAuth: true }),
}