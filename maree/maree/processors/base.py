"""Abstract base class for document processors."""

from abc import ABC, abstractmethod

from maree.models import Chunk, Document


class Processor(ABC):
    """Base class for all processors (chunking, splitting, etc.)."""

    @abstractmethod
    async def process(self, documents: list[Document]) -> list[Chunk]:
        """Split documents into chunks."""
