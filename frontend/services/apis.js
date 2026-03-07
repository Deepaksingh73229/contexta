const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL

// endpoints
export const endPoints = {
    INGEST_API : BASE_URL + "api/ingest",
    CHAT_API : BASE_URL + "api/chat"
}