"""End-to-end RAG pipeline coordinating ingestion, vector retrieval, and grounded generation."""

from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.exceptions import SLMLabException
from app.core.logging import logger
from app.db.repositories.document_repository import document_repository
from app.services.document_service import document_service
from app.services.embedding_service import embedding_service
from app.services.retrieval_service import retrieval_service
from app.services.ollama_service import ollama_service


class RAGService:
    """Orchestrates document indexing, similarity search, and source-grounded model answering."""

    GROUNDED_SYSTEM_PROMPT = (
        "You are a rigorous, truthful Question-Answering assistant. "
        "Answer the user's question using ONLY the provided retrieved context passages. "
        "Every claim you make MUST cite its source using the exact format: [Document: <filename>, Page: <page_number>]. "
        "CRITICAL RULE: If the retrieved context does not contain sufficient factual evidence to answer the question, "
        "you MUST explicitly state: 'Insufficient evidence in the provided documents to answer this question.' "
        "Do NOT invent facts, speculate, or draw upon external knowledge."
    )

    def ingest_document(
        self,
        db: Session,
        filename: str,
        content: bytes,
        chunk_size: int = None,
        chunk_overlap: int = None,
    ) -> Dict[str, Any]:
        """Ingest, extract, chunk, embed, and index a document into ChromaDB and SQLite."""
        # 1. Validate and save file
        file_type = document_service.validate_file(filename, len(content))
        file_path, clean_name, file_size = document_service.save_uploaded_file(filename, content)

        # 2. Extract text and split into structured chunks
        extracted_chunks = document_service.extract_text_and_chunk(
            file_path=file_path,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )

        if not extracted_chunks:
            raise SLMLabException(f"Document '{clean_name}' contains no readable text content.", status_code=422)

        # 3. Create document record in SQLite
        doc = document_repository.create_document(
            db=db,
            filename=clean_name,
            file_path=file_path,
            file_size_bytes=file_size,
            file_type=file_type.lstrip("."),
            chunk_count=len(extracted_chunks),
            status="indexing",
        )

        # 4. Save chunk records in SQLite
        chunk_objs = document_repository.add_chunks(db=db, document_id=doc.id, chunks=extracted_chunks)

        # 5. Generate embeddings using shared embedding model
        texts_to_embed = [c["content"] for c in extracted_chunks]
        embeddings = embedding_service.embed_batch(texts_to_embed)

        # 6. Index into ChromaDB
        chunk_ids = [c.id for c in chunk_objs]
        metadatas = [
            {
                "document_id": doc.id,
                "filename": doc.filename,
                "page_number": c.page_number or 1,
                "chunk_index": c.chunk_index,
            }
            for c in chunk_objs
        ]

        retrieval_service.add_chunks(
            chunk_ids=chunk_ids,
            documents=texts_to_embed,
            metadatas=metadatas,
            embeddings=embeddings,
        )

        doc.status = "indexed"
        db.commit()
        db.refresh(doc)

        return {
            "document_id": doc.id,
            "filename": doc.filename,
            "file_size_bytes": doc.file_size_bytes,
            "chunk_count": doc.chunk_count,
            "status": doc.status,
        }

    def delete_document(self, db: Session, document_id: str) -> bool:
        """Purge document from SQLite and delete all vector embeddings from ChromaDB."""
        # 1. Purge from ChromaDB
        retrieval_service.delete_document_vectors(document_id)

        # 2. Delete from SQLite
        deleted = document_repository.delete_document(db=db, document_id=document_id)
        return deleted is not None

    def search_passages(
        self,
        query: str,
        top_k: int = None,
        filter_document_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve most relevant chunks for a search query."""
        return retrieval_service.search(
            query=query,
            top_k=top_k,
            filter_document_id=filter_document_id,
        )

    async def answer_query(
        self,
        query: str,
        model_tag: str,
        top_k: int = None,
        temperature: float = 0.3,
        filter_document_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Execute complete grounded RAG inference using retrieved passages."""
        # 1. Retrieve relevant passages
        passages = self.search_passages(
            query=query,
            top_k=top_k,
            filter_document_id=filter_document_id,
        )

        # 2. Check for empty index or zero retrieved material
        if not passages:
            return {
                "answer": "Insufficient evidence in the provided documents to answer this question. No relevant documents or passages are currently indexed.",
                "retrieved_passages": [],
                "citations": [],
                "is_grounded": False,
                "insufficient_evidence": True,
                "model_tag": model_tag,
                "latency_ms": 0.0,
            }

        # 3. Assemble grounded context with citation markers
        context_blocks = []
        citations = []
        for idx, p in enumerate(passages):
            doc_name = p.get("filename", "Unknown")
            page_info = f", Page: {p['page_number']}" if p.get("page_number") else ""
            citation_label = f"[Document: {doc_name}{page_info}]"
            citations.append({
                "citation": citation_label,
                "document_id": p.get("document_id"),
                "filename": doc_name,
                "page_number": p.get("page_number"),
                "relevance_score": p.get("relevance_score"),
            })
            context_blocks.append(
                f"--- PASSAGE {idx + 1} {citation_label} (Relevance: {p.get('relevance_score', 0):.2f}) ---\n"
                f"{p['content']}\n"
            )

        context_str = "\n".join(context_blocks)

        user_prompt = (
            f"Retrieved Context:\n{context_str}\n\n"
            f"User Question: {query}\n\n"
            f"Provide a factual, grounded answer with citations. If the evidence is insufficient, state so clearly."
        )

        # 4. Generate answer through Ollama using selected SLM
        inference_result = await ollama_service.chat_completion(
            model=model_tag,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=temperature,
            system_prompt=self.GROUNDED_SYSTEM_PROMPT,
        )

        answer_text = inference_result["content"].strip()
        insufficient = "insufficient evidence" in answer_text.lower()

        return {
            "answer": answer_text,
            "retrieved_passages": passages,
            "citations": citations,
            "is_grounded": not insufficient,
            "insufficient_evidence": insufficient,
            "model_tag": model_tag,
            "latency_ms": inference_result.get("latency_ms"),
            "ttft_ms": inference_result.get("ttft_ms"),
            "tokens_per_second": inference_result.get("tokens_per_second"),
            "input_tokens": inference_result.get("input_tokens"),
            "output_tokens": inference_result.get("output_tokens"),
        }


rag_service = RAGService()
