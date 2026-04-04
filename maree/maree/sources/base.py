"""Abstract base class for document sources."""

from abc import ABC, abstractmethod

from maree.models import Document


class Source(ABC):
    """Base class for all document sources."""

    @abstractmethod
    async def extract(self, path: str) -> list[Document]:
        """Extract documents from the given path."""
