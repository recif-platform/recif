"""Tests for the pipeline orchestrator with mock components."""

from __future__ import annotations

import pytest

from maree.models import Chunk, Document, EnrichedChunk, SearchResult
from maree.pipeline import Pipeline
from maree.processors.base import Processor
from maree.sources.base import Source
from maree.stores.base import Store
from maree.transformers.base import Transformer


# --- Mock implementations ---


class MockSource(Source):
    def __init__(self, documents: list[Document] | None = None) -> None:
        self._docs = documents or []

    async def extract(self, path: str) -> list[Document]:
        return self._docs


class MockProcessor(Processor):
    async def process(self, documents: list[Document]) -> list[Chunk]:
        chunks = []
        for doc in documents:
            chunks.append(
                Chunk(
                    id=f"{doc.id}_c0",
                    document_id=doc.id,
                    content=doc.content,
                    chunk_index=0,
                    metadata={**doc.metadata},
                )
            )
        return chunks


class MockTransformer(Transformer):
    async def transform(self, chunks: list[Chunk]) -> list[EnrichedChunk]:
        return [
            EnrichedChunk(
                id=c.id,
                document_id=c.document_id,
                content=c.content,
                chunk_index=c.chunk_index,
                embedding=[0.0] * 8,
                metadata={**c.metadata},
            )
            for c in chunks
        ]


class MockStore(Store):
    def __init__(self) -> None:
        self.stored: list[EnrichedChunk] = []
        self.deleted: list[str] = []

    async def upsert(self, chunks: list[EnrichedChunk]) -> None:
        self.stored.extend(chunks)

    async def search(
        self, query_embedding: list[float], top_k: int = 5
    ) -> list[SearchResult]:
        return []

    async def delete_by_document(self, document_id: str) -> None:
        self.deleted.append(document_id)


# --- Tests ---


@pytest.mark.asyncio
async def test_pipeline_runs_full_cycle() -> None:
    docs = [
        Document(id="d1", content="hello world"),
        Document(id="d2", content="goodbye world"),
    ]
    store = MockStore()

    pipeline = Pipeline(
        source=MockSource(docs),
        processor=MockProcessor(),
        transformer=MockTransformer(),
        store=store,
    )
    result = await pipeline.run("/fake/path")

    assert result.documents == 2
    assert result.chunks == 2
    assert len(store.stored) == 2


@pytest.mark.asyncio
async def test_pipeline_no_documents() -> None:
    store = MockStore()
    pipeline = Pipeline(
        source=MockSource([]),
        processor=MockProcessor(),
        transformer=MockTransformer(),
        store=store,
    )
    result = await pipeline.run("/empty")

    assert result.documents == 0
    assert result.chunks == 0
    assert len(store.stored) == 0


@pytest.mark.asyncio
async def test_pipeline_preserves_metadata() -> None:
    docs = [Document(id="d1", content="text", metadata={"source": "test"})]
    store = MockStore()

    pipeline = Pipeline(
        source=MockSource(docs),
        processor=MockProcessor(),
        transformer=MockTransformer(),
        store=store,
    )
    await pipeline.run("/fake")

    assert store.stored[0].metadata == {"source": "test"}


@pytest.mark.asyncio
async def test_pipeline_embeddings_present() -> None:
    docs = [Document(id="d1", content="text")]
    store = MockStore()

    pipeline = Pipeline(
        source=MockSource(docs),
        processor=MockProcessor(),
        transformer=MockTransformer(),
        store=store,
    )
    await pipeline.run("/fake")

    assert store.stored[0].embedding is not None
    assert len(store.stored[0].embedding) == 8
