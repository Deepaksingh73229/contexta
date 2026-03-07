import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# LangChain Imports for Local RAG
from langchain_ollama import OllamaEmbeddings, ChatOllama
from langchain_chroma import Chroma
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate

router = APIRouter()

CHROMA_DB_DIR = "./chroma_db"

# Pydantic model to validate the incoming request body
class ChatRequest(BaseModel):
    query: str

@router.post("/api/chat")
async def chat_with_data(request: ChatRequest):
    """
    Endpoint to receive a user query, search the local vector database,
    and generate an answer using local Llama 3.
    """
    if not os.path.exists(CHROMA_DB_DIR):
        raise HTTPException(status_code=404, detail="Database not found. Please ingest documents first.")

    try:
        # 1. Initialize Local Embeddings (must match the one used in upload.py)
        local_embeddings = OllamaEmbeddings(model="nomic-embed-text")

        # 2. Connect to the existing local Vector Database
        vectorstore = Chroma(
            persist_directory=CHROMA_DB_DIR, 
            embedding_function=local_embeddings
        )

        # 3. Create the Retriever
        # "k": 4 means it will fetch the top 4 most relevant text chunks
        retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

        # 4. Initialize the Local LLM (Llama 3 via Ollama)
        # Temperature is set low (0.2) so the model gives factual answers rather than creative ones
        local_llm = ChatOllama(model="Moondream", temperature=0.2)

        # 5. Define the System Prompt
        system_prompt = (
            "You are Contexta, a highly intelligent and secure institutional data assistant. "
            "Use the following pieces of retrieved context to answer the user's question. "
            "If the answer is not contained in the context, explicitly state that you do not know. "
            "Do not hallucinate or make up information. "
            "\n\n"
            "Context:\n{context}"
        )
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{input}"),
        ])

        # 6. Build the RAG Chains
        question_answer_chain = create_stuff_documents_chain(local_llm, prompt)
        rag_chain = create_retrieval_chain(retriever, question_answer_chain)

        # 7. Execute the Query
        response = rag_chain.invoke({"input": request.query})

        # 8. Extract Metadata for Citations (Crucial for your frontend UI)
        sources = []
        for doc in response.get("context", []):
            # LangChain usually stores the file path in 'source' and page number in 'page'
            source_path = doc.metadata.get("source", "Unknown Document")
            filename = os.path.basename(source_path) # Extracts just the file name
            page = doc.metadata.get("page", "N/A")
            
            # Avoid duplicate source citations in the UI
            source_dict = {"name": filename, "page": page}
            if source_dict not in sources:
                sources.append(source_dict)

        # 9. Return the formatted response to Next.js
        return {
            "status": "success",
            "answer": response["answer"],
            "sources": sources
        }

    except Exception as e:
        print("Error: ", str(e))
        raise HTTPException(status_code=500, detail=str(e))