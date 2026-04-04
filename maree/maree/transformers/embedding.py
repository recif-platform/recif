"""Embedding transformer using the Ollama API."""

from __future__ import annotations

import httpx

from maree.transformers.base import EmbeddingTransformerBase


class EmbeddingTransformer(EmbeddingTransformerBase):
    """Generate embeddings via the Ollama /api/embed endpoint."""

    def __init__(self, model: str = "nomic-embed-text", base_url: str = "http://localhost:11434", batch_size: int = 32, **_kwargs: object) -> None:
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.batch_size = batch_size

    async def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.base_url}/api/embed",
                json={"model": self.model, "input": texts},
            )
            response.raise_for_status()
            return response.json()["embeddings"]
