import { endPoints } from "../apis"
import apiConnector from "../apiConnector"

const { INGEST_API } = endPoints

// Function to ingest data for chunking
export const ingestDoc = async (data) => {
    try {
        console.log("Fetching from:", INGEST_API)
        
        // CHANGED: "PUT" to "POST" to match FastAPI @router.post
        const response = await apiConnector(
            "POST", 
            INGEST_API,
            data
        )

        console.log("Response:", response.data)

        // CHANGED: Checking response.data.status instead of response.data.success
        if (response.data.status !== "success") {
            throw new Error(response.data.message || "Problem In Ingestion API")
        }

        console.log("Ingestion Process Completed Successfully")
        
        // Optional: return the data so your UI can use it (e.g., showing how many chunks were created)
        return response.data; 
        
    } 
    catch (error) {
        console.error("Ingest API Error:", error.message || error)
        throw error
    }
}