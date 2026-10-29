"""Repository for document and chunk metadata in SQLite."""

import uuid
import json
import os
from pathlib import Path
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db.models import Document, DocumentChunk


class DocumentRepository:
    """Manages document metadata and chunk records in the application database."""

    @staticmethod
    def create_document(
        db: Session,
        filename: str,
        file_path: str,
        file_size_bytes: int,
        file_type: str,
        chunk_count: int = 0,
        status: str = "indexed",
    ) -> Document:
        """Create and persist document record."""
        doc = Document(
            id=str(uuid.uuid4()),
            filename=filename,
            file_path=file_path,
            file_size_bytes=file_size_bytes,
            file_type=file_type,
            chunk_count=chunk_count,
            status=status,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return doc

    @staticmethod
    def add_chunks(
        db: Session,
        document_id: str,
        chunks: List[Dict[str, Any]],
    ) -> List[DocumentChunk]:
        """Persist chunk records linked to a document."""
        chunk_objs = []
        for idx, c in enumerate(chunks):
            chunk_id = f"{document_id}_{idx}"
            chunk_obj = DocumentChunk(
                id=chunk_id,
                document_id=document_id,
                chunk_index=idx,
                content=c["content"],
                page_number=c.get("page_number"),
                char_length=c["char_length"],
                metadata_json=json.dumps(c.get("metadata", {})),
            )
            db.add(chunk_obj)
            chunk_objs.append(chunk_obj)

        db.commit()
        return chunk_objs

    @staticmethod
    def list_documents(db: Session) -> List[Document]:
        """Return all documents ordered by creation time."""
        stmt = select(Document).order_by(Document.created_at.desc())
        return list(db.scalars(stmt).all())

    @staticmethod
    def get_document(db: Session, document_id: str) -> Optional[Document]:
        """Fetch a specific document with related chunks."""
        stmt = select(Document).where(Document.id == document_id)
        return db.scalar(stmt)

    @staticmethod
    def delete_document(db: Session, document_id: str) -> Optional[Document]:
        """Delete document record and remove physical file from disk."""
        doc = DocumentRepository.get_document(db, document_id)
        if not doc:
            return None

        # Remove physical file if it exists
        try:
            if os.path.exists(doc.file_path):
                os.remove(doc.file_path)
        except Exception as e:
            pass

        db.delete(doc)
        db.commit()
        return doc


document_repository = DocumentRepository()
