from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Initialize the app
app = FastAPI()

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def check_health():
    return {"status": "Active", "message": "Backend is running smoothly!"}

@app.get("/demo")
def test_connection():
    return {"result": "Connection successful", "project": "Contexta : Stop searching folders. Start finding answers"}