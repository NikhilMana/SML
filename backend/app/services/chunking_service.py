"""Document chunking service with configurable chunk sizes, overlap, and boundary awareness."""

import re
from typing import List, Dict, Any
from app.core.config import settings


class ChunkingService:
    """Splits normalized text into overlapping chunks while preserving semantic sentence boundaries."""

    def __init__(
        self,
        default_chunk_size: int = None,
        default_chunk_overlap: int = None,
    ):
        self.chunk_size = default_chunk_size or settings.DEFAULT_CHUNK_SIZE
        self.chunk_overlap = default_chunk_overlap or settings.DEFAULT_CHUNK_OVERLAP

    def split_text(
        self,
        text: str,
        chunk_size: int = None,
        chunk_overlap: int = None,
        page_number: int = None,
    ) -> List[Dict[str, Any]]:
        """Split text into chunks with metadata."""
        size = chunk_size or self.chunk_size
        overlap = chunk_overlap or self.chunk_overlap

        if overlap >= size:
            overlap = max(0, size // 4)

        cleaned_text = re.sub(r"\r\n", "\n", text).strip()
        if not cleaned_text:
            return []

        # Split into natural paragraphs or sentences
        paragraphs = [p.strip() for p in cleaned_text.split("\n\n") if p.strip()]
        
        chunks: List[Dict[str, Any]] = []
        current_chunk: List[str] = []
        current_length = 0

        for para in paragraphs:
            para_len = len(para)

            # If single paragraph exceeds chunk size, split by sentences
            if para_len > size:
                sentences = re.split(r"(?<=[.!?])\s+", para)
                for sentence in sentences:
                    sentence_len = len(sentence)
                    if current_length + sentence_len + 1 > size and current_chunk:
                        chunk_text = " ".join(current_chunk).strip()
                        chunks.append({
                            "content": chunk_text,
                            "char_length": len(chunk_text),
                            "page_number": page_number,
                        })
                        # Retain overlapping sentences from the end
                        overlap_chunk = []
                        overlap_len = 0
                        for s in reversed(current_chunk):
                            if overlap_len + len(s) + 1 <= overlap:
                                overlap_chunk.insert(0, s)
                                overlap_len += len(s) + 1
                            else:
                                break
                        current_chunk = overlap_chunk
                        current_length = overlap_len

                    current_chunk.append(sentence)
                    current_length += sentence_len + 1
            else:
                if current_length + para_len + 2 > size and current_chunk:
                    chunk_text = "\n\n".join(current_chunk).strip()
                    chunks.append({
                        "content": chunk_text,
                        "char_length": len(chunk_text),
                        "page_number": page_number,
                    })
                    # Reset with overlap
                    current_chunk = [para]
                    current_length = para_len
                else:
                    current_chunk.append(para)
                    current_length += para_len + 2

        if current_chunk:
            chunk_text = " ".join(current_chunk).strip()
            if chunk_text:
                chunks.append({
                    "content": chunk_text,
                    "char_length": len(chunk_text),
                    "page_number": page_number,
                })

        return chunks


chunking_service = ChunkingService()
