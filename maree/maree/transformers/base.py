"""Abstract base class for chunk transformers."""

from abc import ABC, abstractmethod

from maree.models import Chunk, EnrichedChunk


class Transformer(ABC):
    """Base class for all transformers (embedding, metadata enrichment, etc.)."""

    @abstractmethod
    async def transform(self, chunks: list[Chunk]) -> list[EnrichedChunk]:
        """Transform chunks into enriched chunks."""


class EmbeddingTransformerBase(Transformer):
    """Base class for embedding transformers with shared batch logic."""

    batch_size: int = 32

    async def transform(self, chunks: list[Chunk]) -> list[EnrichedChunk]:
        enriched: list[EnrichedChunk] = []

        for batch_start in range(0, len(chunks), self.batch_size):
            batch = chunks[batch_start : batch_start + self.batch_size]
            texts = [c.content for c in batch]
            embeddings = await self._embed_batch(texts)

            for chunk, embedding in zip(batch, embeddings, strict=True):
                enriched.append(
                    EnrichedChunk(
                        id=chunk.id,
                        document_id=chunk.document_id,
                        content=chunk.content,
                        chunk_index=chunk.chunk_index,
                        embedding=embedding,
                        metadata={**chunk.metadata},
                    )
                )

        return enriched

    @abstractmethod
    async def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts. Subclasses implement the provider-specific call."""
