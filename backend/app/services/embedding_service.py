"""Local embedding generation service powered by sentence-transformers."""

from typing import List
from sentence_transformers import SentenceTransformer
from app.core.config import settings
from app.core.logging import logger


class EmbeddingService:
    """Generates dense vector representations using a shared local embedding model."""

    def __init__(self, model_name: str = None):
        self.model_name = model_name or settings.EMBEDDING_MODEL_NAME
        self._model = None

    @property
    def model(self) -> SentenceTransformer:
        """Lazy loader for SentenceTransformer to optimize initial server boot."""
        if self._model is None:
            logger.info(f"Loading local embedding model: '{self.model_name}'...")
            self._model = SentenceTransformer(self.model_name)
            logger.info(f"Embedding model '{self.model_name}' loaded successfully.")
        return self._model

    def embed_text(self, text: str) -> List[float]:
        """Convert a single query or passage into a normalized vector embedding."""
        embedding = self.model.encode(text, normalize_embeddings=True)
        return embedding.tolist()

    def embed_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """Compute embeddings in batches for efficient throughput."""
        if not texts:
            return []
        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
        return embeddings.tolist()


embedding_service = EmbeddingService()
