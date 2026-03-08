import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException

# LangChain Imports
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma

# Initialize the router instead of the 'app'
router = APIRouter()

UPLOAD_DIR = "./temp_uploads"
CHROMA_DB_DIR = "./chroma_db"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("/ingest-test")
def ingest_health():
    return {"status": "Active", "message": "Ingestion working properly!"}

@router.post("/api/ingest")
async def ingest_document(file: UploadFile = File(...)):
    """
    Endpoint to receive a PDF, chunk it, embed it using local Ollama, 
    and store it in a local Chroma vector database.
    """
    print("Ingest")
    
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    try:
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Load and Chunk
        loader = PyPDFLoader(file_path)
        documents = loader.load()
        
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=100
        )
        chunks = text_splitter.split_documents(documents)

        # Embed and Store Locally
        local_embeddings = OllamaEmbeddings(model="nomic-embed-text")
        vectorstore = Chroma.from_documents(
            documents=chunks,
            embedding=local_embeddings,
            persist_directory=CHROMA_DB_DIR
        )

        # Clean up
        os.remove(file_path)

        return {
            "status": "success",
            "message": f"{file.filename} ingested successfully.",
            "chunks": len(chunks)
        }

    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))