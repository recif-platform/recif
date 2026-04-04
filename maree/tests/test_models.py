"""Tests for core data models."""

from maree.models import Chunk, Document, EnrichedChunk, PipelineResult, SearchResult


class TestDocument:
    def test_create_minimal(self) -> None:
        doc = Document(id="d1", content="hello")
        assert doc.id == "d1"
        assert doc.content == "hello"
        assert doc.metadata == {}

    def test_create_with_metadata(self) -> None:
        meta = {"filename": "test.txt", "size_bytes": 42}
        doc = Document(id="d2", content="world", metadata=meta)
        assert doc.metadata == meta

    def test_default_metadata_is_not_shared(self) -> None:
        a = Document(id="a", content="")
        b = Document(id="b", content="")
        a.metadata["key"] = "value"
        assert "key" not in b.metadata


class TestChunk:
    def test_create(self) -> None:
        chunk = Chunk(id="c1", document_id="d1", content="text", chunk_index=0)
        assert chunk.document_id == "d1"
        assert chunk.chunk_index == 0
        assert chunk.metadata == {}


class TestEnrichedChunk:
    def test_create_without_embedding(self) -> None:
        ec = EnrichedChunk(id="e1", document_id="d1", content="t", chunk_index=0)
        assert ec.embedding is None

    def test_create_with_embedding(self) -> None:
        vec = [0.1, 0.2, 0.3]
        ec = EnrichedChunk(
            id="e2", document_id="d1", content="t", chunk_index=0, embedding=vec
        )
        assert ec.embedding == vec


class TestSearchResult:
    def test_create(self) -> None:
        sr = SearchResult(chunk_id="c1", content="found", score=0.95)
        assert sr.score == 0.95
        assert sr.metadata == {}


class TestPipelineResult:
    def test_create(self) -> None:
        pr = PipelineResult(documents=3, chunks=15)
        assert pr.documents == 3
        assert pr.chunks == 15
