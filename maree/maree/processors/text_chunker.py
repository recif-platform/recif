"""Character-based text chunker with overlap."""

from __future__ import annotations

import hashlib

from maree.models import Chunk, Document
from maree.processors.base import Processor


class TextChunker(Processor):
    """Split documents into fixed-size character chunks with overlap."""

    def __init__(self, chunk_size: int = 500, overlap: int = 50) -> None:
        if chunk_size <= 0:
            raise ValueError("chunk_size must be positive")
        if overlap < 0:
            raise ValueError("overlap must be non-negative")
        if overlap >= chunk_size:
            raise ValueError("overlap must be smaller than chunk_size")

        self.chunk_size = chunk_size
        self.overlap = overlap

    async def process(self, documents: list[Document]) -> list[Chunk]:
        chunks: list[Chunk] = []

        for doc in documents:
            doc_chunks = self._split(doc)
            chunks.extend(doc_chunks)

        return chunks

    def _split(self, doc: Document) -> list[Chunk]:
        text = doc.content
        if not text:
            return []

        chunks: list[Chunk] = []
        step = self.chunk_size - self.overlap
        start = 0
        index = 0

        while start < len(text):
            end = start + self.chunk_size
            segment = text[start:end]

            chunk_id = hashlib.sha256(
                f"{doc.id}:{index}".encode()
            ).hexdigest()[:16]

            chunks.append(
                Chunk(
                    id=chunk_id,
                    document_id=doc.id,
                    content=segment,
                    chunk_index=index,
                    metadata={**doc.metadata},
                )
            )

            start += step
            index += 1

        return chunks
