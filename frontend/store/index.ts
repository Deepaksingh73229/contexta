// ============================================================
// store/index.ts
// Single import point for the store, hooks, and all slice exports.
// ============================================================

// Store
export { store } from "./store"
export type { RootState, AppDispatch } from "./store"

// Typed hooks
export { useAppDispatch, useAppSelector } from "./hooks"

// Auth slice
export {
    login,
    logout,
    fetchProfile,
    sessionExpired,
    clearError as clearAuthError,
    selectUser,
    selectProfile,
    selectIsAuthenticated,
    selectAuthStatus,
    selectAuthError,
    selectRole,
    selectPermissions,
    selectHasPermission,
} from "./slices/authSlice"

// Tasks slice
export {
    fetchTasks,
    fetchTask,
    cancelTask,
    deleteTask,
    applySSEUpdate,
    markStreaming,
    markStreamClosed,
    addPendingTask,
    selectAllTasks,
    selectTask,
    selectActiveTasks,
    selectTasksListStatus,
    selectTasksListError,
} from "./slices/tasksSlice"

// Query slice
export {
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
} from "./slices/querySlice"