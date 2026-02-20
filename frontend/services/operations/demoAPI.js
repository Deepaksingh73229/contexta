import { endPoints } from "../apis"
import apiConnector from "../apiConnector"

const { DEMO_API } = endPoints

// Function to fetch demo data from backend
const fetchDemoData = () => {
    return async () => {
        try {
            console.log("Fetching from:", DEMO_API)
            const response = await apiConnector(
                "GET",
                DEMO_API,
                null
            )

            console.log("Response:", response.data)

            if (!response.data.success) {
                throw new Error(response.data.message || "Unknown error")
            }

            return response.data

        } catch (error) {
            console.error("Demo API Error:", error.message || error)
            throw error
        }
    }
}

export default fetchDemoData