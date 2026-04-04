"""Tests for the TextChunker processor."""

import pytest
import pytest_asyncio  # noqa: F401 -- ensures the plugin is loaded

from maree.models import Document
from maree.processors.text_chunker import TextChunker


@pytest.fixture
def chunker() -> TextChunker:
    return TextChunker(chunk_size=10, overlap=3)


@pytest.mark.asyncio
async def test_basic_chunking(chunker: TextChunker) -> None:
    doc = Document(id="d1", content="abcdefghijklmnopqrstuvwxyz")
    chunks = await chunker.process([doc])

    # chunk_size=10, overlap=3 -> step=7
    # Chunks: [0:10], [7:17], [14:24], [21:31]
    assert len(chunks) == 4
    assert chunks[0].content == "abcdefghij"
    assert chunks[1].content == "hijklmnopq"
    assert chunks[2].content == "opqrstuvwx"
    assert chunks[3].content == "vwxyz"


@pytest.mark.asyncio
async def test_single_chunk(chunker: TextChunker) -> None:
    doc = Document(id="d1", content="short")
    chunks = await chunker.process([doc])
    assert len(chunks) == 1
    assert chunks[0].content == "short"


@pytest.mark.asyncio
async def test_empty_content(chunker: TextChunker) -> None:
    doc = Document(id="d1", content="")
    chunks = await chunker.process([doc])
    assert len(chunks) == 0


@pytest.mark.asyncio
async def test_exact_chunk_size_no_overlap() -> None:
    """With zero overlap, text exactly matching chunk_size produces one chunk."""
    c = TextChunker(chunk_size=10, overlap=0)
    doc = Document(id="d1", content="a" * 10)
    chunks = await c.process([doc])
    assert len(chunks) == 1
    assert chunks[0].content == "a" * 10


@pytest.mark.asyncio
async def test_exact_chunk_size_with_overlap(chunker: TextChunker) -> None:
    """With overlap, text matching chunk_size still produces an overlap tail."""
    doc = Document(id="d1", content="a" * 10)
    chunks = await chunker.process([doc])
    # step=7 so position 7 creates a second chunk of 3 chars
    assert len(chunks) == 2
    assert chunks[0].content == "a" * 10
    assert chunks[1].content == "a" * 3


@pytest.mark.asyncio
async def test_chunk_ids_are_unique(chunker: TextChunker) -> None:
    doc = Document(id="d1", content="a" * 30)
    chunks = await chunker.process([doc])
    ids = [c.id for c in chunks]
    assert len(ids) == len(set(ids))


@pytest.mark.asyncio
async def test_chunk_indices_sequential(chunker: TextChunker) -> None:
    doc = Document(id="d1", content="a" * 30)
    chunks = await chunker.process([doc])
    indices = [c.chunk_index for c in chunks]
    assert indices == list(range(len(chunks)))


@pytest.mark.asyncio
async def test_metadata_preserved(chunker: TextChunker) -> None:
    meta = {"filename": "test.txt"}
    doc = Document(id="d1", content="abcdefghij", metadata=meta)
    chunks = await chunker.process([doc])
    assert chunks[0].metadata == meta


@pytest.mark.asyncio
async def test_metadata_not_shared_between_chunks(chunker: TextChunker) -> None:
    meta = {"key": "val"}
    doc = Document(id="d1", content="a" * 20, metadata=meta)
    chunks = await chunker.process([doc])
    chunks[0].metadata["extra"] = True
    assert "extra" not in chunks[1].metadata


@pytest.mark.asyncio
async def test_multiple_documents(chunker: TextChunker) -> None:
    docs = [
        Document(id="d1", content="a" * 15),
        Document(id="d2", content="b" * 15),
    ]
    chunks = await chunker.process(docs)
    d1_chunks = [c for c in chunks if c.document_id == "d1"]
    d2_chunks = [c for c in chunks if c.document_id == "d2"]
    assert len(d1_chunks) >= 1
    assert len(d2_chunks) >= 1


def test_invalid_chunk_size() -> None:
    with pytest.raises(ValueError, match="chunk_size must be positive"):
        TextChunker(chunk_size=0)


def test_negative_overlap() -> None:
    with pytest.raises(ValueError, match="overlap must be non-negative"):
        TextChunker(chunk_size=10, overlap=-1)


def test_overlap_too_large() -> None:
    with pytest.raises(ValueError, match="overlap must be smaller"):
        TextChunker(chunk_size=10, overlap=10)
