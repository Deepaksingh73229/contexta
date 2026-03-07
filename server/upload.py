import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# LangChain Imports for Local RAG
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma

app = FastAPI(title="Contexta API", description="Local RAG Backend for Institutional Data")

# Enable CORS so your Next.js frontend (running on port 3000) can communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories for local storage
UPLOAD_DIR = "./temp_uploads"
CHROMA_DB_DIR = "./chroma_db"

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/api/ingest")
async def ingest_document(file: UploadFile = File(...)):
    """
    Endpoint to receive a PDF, chunk it, embed it using local Ollama, 
    and store it in a local Chroma vector database.
    """
    # 1. Validate File Type (MVP focuses on PDFs)
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for this MVP.")

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    try:
        # 2. Save the uploaded file temporarily to the local disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 3. Load the Document
        loader = PyPDFLoader(file_path)
        documents = loader.load()

        # 4. Chunk the Text
        # We split the text into 1000-character chunks with a 100-character overlap.
        # The overlap ensures we don't accidentally cut a sentence or concept in half.
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=100,
            separators=["\n\n", "\n", " ", ""]
        )
        chunks = text_splitter.split_documents(documents)

        # 5. Initialize Local Embeddings (nomic-embed-text via Ollama)
        local_embeddings = OllamaEmbeddings(model="nomic-embed-text")

        # 6. Store in Vector Database
        # This converts the chunks into vectors and saves them locally in the chroma_db folder
        vectorstore = Chroma.from_documents(
            documents=chunks,
            embedding=local_embeddings,
            persist_directory=CHROMA_DB_DIR
        )

        # 7. Clean up the temporary file to save space
        os.remove(file_path)

        return {
            "status": "success",
            "message": "Document successfully ingested.",
            "filename": file.filename,
            "chunks_created": len(chunks)
        }

    except Exception as e:
        # Clean up the file if something goes wrong
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))

# Health check endpoint
@app.get("/")
def health_check():
    return {"status": "Contexta Backend is running offline and securely."}