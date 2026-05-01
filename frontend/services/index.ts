// ============================================================
// services/index.ts
// Single import point for all services.
//
// Usage:
//   import { authService, queryService } from "@/services"
// ============================================================

export { authService } from "./operations/auth.service"
export { ingestService } from "./operations/ingest.service"
export { tasksService } from "./operations/tasks.service"
export { queryService } from "./operations/query.service"
export { citationsService } from "./operations/citations.service"
export { adminService } from "./operations/admin.service"