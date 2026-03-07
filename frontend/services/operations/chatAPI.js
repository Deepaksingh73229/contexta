import { endPoints } from "../apis"
import apiConnector from "../apiConnector"

const { CHAT_API } = endPoints

// Function to send a user question and retrieve the AI's answer
export const querySearch = async (queryText) => {
    try {
        console.log("Sending query to:", CHAT_API)
        
        // 1. Format the payload to match FastAPI's ChatRequest Pydantic model
        const payload = {
            query: queryText
        }

        // 2. Make the POST request
        const response = await apiConnector(
            "POST", 
            CHAT_API,
            payload
        )

        console.log("Chat Response:", response.data)

        // 3. Validate the response status
        if (response.data.status !== "success") {
            throw new Error(response.data.detail || "Problem In Chat API")
        }

        console.log("Query Processed Successfully")
        
        // 4. Return the data (this contains response.data.answer and response.data.sources)
        return response.data; 
        
    } 
    catch (error) {
        console.error("Chat API Error:", error.message || error)
        throw error
    }
}