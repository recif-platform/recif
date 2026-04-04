"""PostgreSQL + pgvector store implementation with hybrid BM25 + semantic search."""

from __future__ import annotations

import json
import logging

import asyncpg  # type: ignore[import-untyped]

from maree.models import EnrichedChunk, SearchResult
from maree.stores.base import Store

logger = logging.getLogger(__name__)

_UPSERT_SQL = """
INSERT INTO chunks (id, document_id, kb_id, content, chunk_index, embedding, metadata)
VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
ON CONFLICT (id) DO UPDATE SET
    content     = EXCLUDED.content,
    chunk_index = EXCLUDED.chunk_index,
    embedding   = EXCLUDED.embedding,
    metadata    = EXCLUDED.metadata;
"""

_SEMANTIC_SEARCH_SQL = """
SELECT id, content, 1 - (embedding <=> $1::vector) AS score, metadata
FROM chunks
WHERE kb_id = $2
ORDER BY embedding <=> $1::vector
LIMIT $3;
"""

_BM25_SEARCH_SQL = """
SELECT id, content, ts_rank_cd(tsv, plainto_tsquery('english', $1)) AS score, metadata
FROM chunks
WHERE kb_id = $2 AND tsv @@ plainto_tsquery('english', $1)
ORDER BY score DESC
LIMIT $3;
"""

_DELETE_SQL = """
DELETE FROM chunks WHERE document_id = $1;
"""

# Reciprocal Rank Fusion constant (standard value)
_RRF_K = 60


def _format_embedding(embedding: list[float] | None) -> str | None:
    """Convert a Python list of floats to pgvector literal format: [0.1,0.2,...]."""
    if embedding is None:
        return None
    return "[" + ",".join(str(x) for x in embedding) + "]"


class PgVectorStore(Store):
    """Vector store backed by PostgreSQL with the pgvector extension."""

    def __init__(self, dsn: str, kb_id: str = "default") -> None:
        self.dsn = dsn
        self.kb_id = kb_id
        self._pool: asyncpg.Pool | None = None

    async def _ensure_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            self._pool = await asyncpg.create_pool(self.dsn, min_size=1, max_size=5)
            logger.info("pgvector store connected (kb_id=%s)", self.kb_id)
        return self._pool

    async def upsert(self, chunks: list[EnrichedChunk]) -> None:
        pool = await self._ensure_pool()
        async with pool.acquire() as conn:
            # Ensure document entries exist (for FK constraint)
            seen_docs: set[str] = set()
            for chunk in chunks:
                if chunk.document_id not in seen_docs:
                    await conn.execute(
                        "INSERT INTO kb_documents (id, kb_id, filename, status, chunk_count) "
                        "VALUES ($1, $2, $3, 'processing', 0) ON CONFLICT (id) DO NOTHING",
                        chunk.document_id, self.kb_id, chunk.metadata.get("filename", "unknown"),
                    )
                    seen_docs.add(chunk.document_id)

            # Upsert chunks
            for chunk in chunks:
                embedding_str = _format_embedding(chunk.embedding)
                await conn.execute(
                    _UPSERT_SQL,
                    chunk.id,
                    chunk.document_id,
                    self.kb_id,
                    chunk.content,
                    chunk.chunk_index,
                    embedding_str,
                    json.dumps(chunk.metadata),
                )

            # Update document status
            for doc_id in seen_docs:
                count = await conn.fetchval(
                    "SELECT COUNT(*) FROM chunks WHERE document_id = $1", doc_id
                )
                await conn.execute(
                    "UPDATE kb_documents SET status = 'ready', chunk_count = $1 WHERE id = $2",
                    count, doc_id,
                )

    async def search(
        self, query_embedding: list[float], top_k: int = 5
    ) -> list[SearchResult]:
        """Pure semantic (cosine similarity) search."""
        return await self._semantic_search(query_embedding, self.kb_id, top_k)

    async def hybrid_search(
        self,
        query_embedding: list[float],
        query_text: str,
        kb_id: str | None = None,
        top_k: int = 5,
    ) -> list[SearchResult]:
        """Hybrid search combining pgvector cosine similarity and BM25 full-text search.

        Uses Reciprocal Rank Fusion (RRF) with k=60 to merge the two result sets.
        """
        target_kb = kb_id or self.kb_id
        fetch_k = top_k * 2  # over-fetch for better fusion

        semantic_results = await self._semantic_search(query_embedding, target_kb, fetch_k)
        bm25_results = await self._bm25_search(query_text, target_kb, fetch_k)

        return self._rrf_merge(semantic_results, bm25_results, top_k)

    async def _semantic_search(
        self, query_embedding: list[float], kb_id: str, top_k: int
    ) -> list[SearchResult]:
        pool = await self._ensure_pool()
        embedding_str = _format_embedding(query_embedding)
        async with pool.acquire() as conn:
            rows = await conn.fetch(_SEMANTIC_SEARCH_SQL, embedding_str, kb_id, top_k)
            return [
                SearchResult(
                    chunk_id=row["id"],
                    content=row["content"],
                    score=float(row["score"]),
                    metadata=json.loads(row["metadata"]) if row["metadata"] else {},
                )
                for row in rows
            ]

    async def _bm25_search(
        self, query_text: str, kb_id: str, top_k: int
    ) -> list[SearchResult]:
        pool = await self._ensure_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(_BM25_SEARCH_SQL, query_text, kb_id, top_k)
            return [
                SearchResult(
                    chunk_id=row["id"],
                    content=row["content"],
                    score=float(row["score"]),
                    metadata=json.loads(row["metadata"]) if row["metadata"] else {},
                )
                for row in rows
            ]

    @staticmethod
    def _rrf_merge(
        semantic: list[SearchResult],
        bm25: list[SearchResult],
        top_k: int,
    ) -> list[SearchResult]:
        """Merge two ranked lists using Reciprocal Rank Fusion (RRF).

        RRF score = sum( 1 / (k + rank) ) across all lists where the item appears.
        """
        scores: dict[str, float] = {}
        results_by_id: dict[str, SearchResult] = {}

        for rank, result in enumerate(semantic, start=1):
            scores[result.chunk_id] = scores.get(result.chunk_id, 0.0) + 1.0 / (_RRF_K + rank)
            results_by_id[result.chunk_id] = result

        for rank, result in enumerate(bm25, start=1):
            scores[result.chunk_id] = scores.get(result.chunk_id, 0.0) + 1.0 / (_RRF_K + rank)
            results_by_id.setdefault(result.chunk_id, result)

        ranked_ids = sorted(scores, key=lambda cid: scores[cid], reverse=True)[:top_k]

        return [
            SearchResult(
                chunk_id=cid,
                content=results_by_id[cid].content,
                score=scores[cid],
                metadata=results_by_id[cid].metadata,
            )
            for cid in ranked_ids
        ]

    async def delete_by_document(self, document_id: str) -> None:
        pool = await self._ensure_pool()
        async with pool.acquire() as conn:
            await conn.execute(_DELETE_SQL, document_id)

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
