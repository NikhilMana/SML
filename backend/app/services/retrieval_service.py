"""Vector retrieval service using local persistent ChromaDB."""

from pathlib import Path
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings
from app.core.config import settings
from app.core.logging import logger
from app.services.embedding_service import embedding_service

COLLECTION_NAME = "local_slm_rag"


class RetrievalService:
    """Manages ChromaDB vector indexing and similarity retrieval."""

    def __init__(self):
        settings.ensure_directories()
        persist_dir = str(Path(settings.CHROMA_PERSIST_DIRECTORY).resolve())
        self._client = chromadb.PersistentClient(
            path=persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    @property
    def collection(self):
        return self._collection

    def add_chunks(
        self,
        chunk_ids: List[str],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
        embeddings: List[List[float]],
    ) -> int:
        """Add chunk vectors and metadata to ChromaDB."""
        if not chunk_ids:
            return 0

        # Sanitize metadata for Chroma (no None values)
        clean_metadatas = []
        for m in metadatas:
            clean_m = {}
            for k, v in m.items():
                if v is not None:
                    clean_m[k] = v
                else:
                    clean_m[k] = ""
            clean_metadatas.append(clean_m)

        self.collection.add(
            ids=chunk_ids,
            documents=documents,
            metadatas=clean_metadatas,
            embeddings=embeddings,
        )
        logger.info(f"Indexed {len(chunk_ids)} chunk vectors in ChromaDB collection '{COLLECTION_NAME}'.")
        return len(chunk_ids)

    def delete_document_vectors(self, document_id: str) -> int:
        """Purge all vector embeddings associated with a deleted document."""
        try:
            # Query IDs belonging to this document
            existing = self.collection.get(
                where={"document_id": document_id},
                include=[],
            )
            ids_to_delete = existing.get("ids", [])
            if ids_to_delete:
                self.collection.delete(ids=ids_to_delete)
                logger.info(f"Purged {len(ids_to_delete)} vectors for document {document_id}")
                return len(ids_to_delete)
        except Exception as e:
            logger.error(f"Error purging ChromaDB vectors for document {document_id}: {e}")
        return 0

    def search(
        self,
        query: str,
        top_k: int = None,
        min_relevance: float = 0.0,
        filter_document_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Perform semantic similarity search against indexed passages."""
        k = top_k or settings.DEFAULT_TOP_K

        # Check if collection is empty
        count = self.collection.count()
        if count == 0:
            return []

        actual_k = min(k, count)
        query_embedding = embedding_service.embed_text(query)

        where_clause = {"document_id": filter_document_id} if filter_document_id else None

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=actual_k,
            where=where_clause,
            include=["documents", "metadatas", "distances"],
        )

        retrieved_passages: List[Dict[str, Any]] = []
        if not results or not results.get("ids") or not results["ids"][0]:
            return []

        ids = results["ids"][0]
        docs = results["documents"][0] if results.get("documents") else []
        metas = results["metadatas"][0] if results.get("metadatas") else []
        distances = results["distances"][0] if results.get("distances") else []

        for idx in range(len(ids)):
            dist = distances[idx] if idx < len(distances) else 1.0
            # For cosine space in Chroma, distance is (1 - cosine_similarity).
            # Higher relevance score = closer match (0.0 to 1.0)
            relevance = max(0.0, min(1.0, round(1.0 - dist, 4)))

            if relevance < min_relevance:
                continue

            meta = metas[idx] if idx < len(metas) else {}
            retrieved_passages.append({
                "chunk_id": ids[idx],
                "content": docs[idx] if idx < len(docs) else "",
                "relevance_score": relevance,
                "document_id": meta.get("document_id", ""),
                "filename": meta.get("filename", ""),
                "page_number": meta.get("page_number", "") or None,
                "chunk_index": meta.get("chunk_index", 0),
            })

        return retrieved_passages


retrieval_service = RetrievalService()
