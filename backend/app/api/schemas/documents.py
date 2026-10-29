"""Pydantic schemas for RAG document management, vector search, and grounded Q&A."""

import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class DocumentChunkResponse(BaseModel):
    """Schema for an individual document chunk."""

    id: str
    document_id: str
    chunk_index: int
    content: str
    page_number: Optional[int] = None
    char_length: int

    model_config = ConfigDict(from_attributes=True)


class DocumentResponse(BaseModel):
    """Schema for document metadata."""

    id: str
    filename: str
    file_size_bytes: int
    file_type: str
    status: str
    chunk_count: int
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class RAGSearchRequest(BaseModel):
    """Payload to search vector store without generation."""

    query: str = Field(..., min_length=1)
    top_k: Optional[int] = Field(3, ge=1, le=20)
    filter_document_id: Optional[str] = None


class RAGSearchResult(BaseModel):
    """Retrieved passage with similarity metrics and source location."""

    chunk_id: str
    content: str
    relevance_score: float
    document_id: str
    filename: str
    page_number: Optional[int] = None
    chunk_index: int


class RAGQueryRequest(BaseModel):
    """Payload to execute grounded question answering."""

    query: str = Field(..., min_length=1, description="Question about the uploaded documents")
    model_tag: Optional[str] = Field("qwen2.5:3b", description="Model used for generation")
    top_k: Optional[int] = Field(3, ge=1, le=10)
    temperature: Optional[float] = Field(0.3, ge=0.0, le=1.5)
    filter_document_id: Optional[str] = None


class RAGQueryResponse(BaseModel):
    """Grounded answer accompanied by citation audit trail and retrieved context."""

    answer: str
    retrieved_passages: List[RAGSearchResult]
    citations: List[Dict[str, Any]]
    is_grounded: bool
    insufficient_evidence: bool
    model_tag: str
    latency_ms: Optional[float] = None
    ttft_ms: Optional[float] = None
    tokens_per_second: Optional[float] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
