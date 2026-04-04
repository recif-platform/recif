"""Core data models for the ingestion pipeline."""

from dataclasses import dataclass, field


@dataclass
class Document:
    """A raw document extracted from a source."""

    id: str
    content: str
    metadata: dict = field(default_factory=dict)


@dataclass
class Chunk:
    """A chunk of a document, produced by a processor."""

    id: str
    document_id: str
    content: str
    chunk_index: int
    metadata: dict = field(default_factory=dict)


@dataclass
class EnrichedChunk:
    """A chunk enriched with an embedding vector."""

    id: str
    document_id: str
    content: str
    chunk_index: int
    embedding: list[float] | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class SearchResult:
    """A single result from a vector similarity search."""

    chunk_id: str
    content: str
    score: float
    metadata: dict = field(default_factory=dict)


@dataclass
class PipelineResult:
    """Summary of a pipeline run."""

    documents: int
    chunks: int
