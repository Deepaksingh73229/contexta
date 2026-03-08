from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import the router from your upload.py file
from ingest import router as ingest_router
from chat import router as chat_router
from citations import router as citations_router

# Initialize the app
app = FastAPI(title="Contexta API", description="Local RAG Backend")

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect the upload route to the main app
app.include_router(ingest_router)
app.include_router(chat_router)
app.include_router(citations_router, prefix="/api")

@app.get("/")
def check_health():
    return {"status": "Active", "message": "Backend is running smoothly!"}

@app.get("/demo")
def test_connection():
    return {"result": "Connection successful", "project": "Contexta : Stop searching folders. Start finding answers"}