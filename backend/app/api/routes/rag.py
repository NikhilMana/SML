"""API routes for Document Ingestion, ChromaDB Vector Retrieval, and Grounded RAG Querying."""

from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_app_db
from app.db.repositories.document_repository import document_repository
from app.services.rag_service import rag_service
from app.api.schemas.documents import (
    DocumentResponse,
    DocumentChunkResponse,
    RAGSearchRequest,
    RAGSearchResult,
    RAGQueryRequest,
    RAGQueryResponse,
)

router = APIRouter(prefix="/rag", tags=["Retrieval-Augmented Generation"])


@router.post("/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    chunk_size: Optional[int] = Form(None),
    chunk_overlap: Optional[int] = Form(None),
    db: Session = Depends(get_app_db),
):
    """Upload a document (PDF, DOCX, TXT, MD), parse, chunk, embed, and index into ChromaDB."""
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    result = rag_service.ingest_document(
        db=db,
        filename=file.filename or "uploaded_document.txt",
        content=content,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )

    doc = document_repository.get_document(db=db, document_id=result["document_id"])
    return doc


@router.get("/documents", response_model=List[DocumentResponse])
def list_documents(db: Session = Depends(get_app_db)):
    """List all indexed documents, sizes, and chunk counts."""
    return document_repository.list_documents(db=db)


@router.get("/documents/{document_id}")
def get_document_details(document_id: str, db: Session = Depends(get_app_db)):
    """Get document metadata and individual extracted chunk passages."""
    doc = document_repository.get_document(db=db, document_id=document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found.",
        )
    return {
        "id": doc.id,
        "filename": doc.filename,
        "file_size_bytes": doc.file_size_bytes,
        "file_type": doc.file_type,
        "status": doc.status,
        "chunk_count": doc.chunk_count,
        "created_at": doc.created_at,
        "chunks": [DocumentChunkResponse.model_validate(c) for c in doc.chunks],
    }


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str, db: Session = Depends(get_app_db)):
    """Delete document metadata and purge its associated vector embeddings from ChromaDB."""
    deleted = rag_service.delete_document(db=db, document_id=document_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found.",
        )
    return None


@router.post("/search", response_model=List[RAGSearchResult])
def search_vector_store(payload: RAGSearchRequest):
    """Perform vector similarity search and inspect retrieved passages with relevance scores."""
    results = rag_service.search_passages(
        query=payload.query,
        top_k=payload.top_k,
        filter_document_id=payload.filter_document_id,
    )
    return [RAGSearchResult(**r) for r in results]


@router.post("/query", response_model=RAGQueryResponse)
async def query_rag_pipeline(payload: RAGQueryRequest):
    """Execute grounded question answering with citations and evidence verification."""
    result = await rag_service.answer_query(
        query=payload.query,
        model_tag=payload.model_tag or "qwen2.5:3b",
        top_k=payload.top_k or 3,
        temperature=payload.temperature or 0.3,
        filter_document_id=payload.filter_document_id,
    )
    return RAGQueryResponse(**result)
