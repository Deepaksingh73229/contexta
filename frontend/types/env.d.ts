// ============================================================
// types/env.d.ts
// Type declarations for environment variables.
// ============================================================

declare namespace NodeJS {
    interface ProcessEnv {
        /** Backend API base URL. Defaults to http://localhost:8000 */
        NEXT_PUBLIC_API_URL?: string

        /** Node environment */
        NODE_ENV: "development" | "production" | "test"
    }
}