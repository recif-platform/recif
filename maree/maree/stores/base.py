"""Abstract base class for vector stores."""

from abc import ABC, abstractmethod

from maree.models import EnrichedChunk, SearchResult


class Store(ABC):
    """Base class for all vector stores."""

    @abstractmethod
    async def upsert(self, chunks: list[EnrichedChunk]) -> None:
        """Insert or update enriched chunks."""

    @abstractmethod
    async def search(
        self, query_embedding: list[float], top_k: int = 5
    ) -> list[SearchResult]:
        """Find the most similar chunks to the query embedding."""

    @abstractmethod
    async def delete_by_document(self, document_id: str) -> None:
        """Delete all chunks belonging to a document."""
