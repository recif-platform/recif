"""Embedding transformer using Google Vertex AI text-embedding API."""

from __future__ import annotations

import os

from maree.transformers.base import EmbeddingTransformerBase
from maree.transformers.gcp_auth import GCPTokenProvider


class VertexEmbeddingTransformer(EmbeddingTransformerBase):
    """Generate embeddings via Vertex AI text-embedding API."""

    def __init__(self, model: str = "text-embedding-005", batch_size: int = 5, **_kwargs: object) -> None:
        self.model = model
        self.batch_size = batch_size
        self._auth = GCPTokenProvider()
        self._location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

    def _base_url(self) -> str:
        return (
            f"https://{self._location}-aiplatform.googleapis.com/v1"
            f"/projects/{self._auth.project}/locations/{self._location}"
            f"/publishers/google/models/{self.model}"
        )

    async def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not self._auth.project:
            # Force a token fetch to auto-detect project from credentials
            await self._auth.get_token()
        if not self._auth.project:
            msg = "GOOGLE_CLOUD_PROJECT not set"
            raise ValueError(msg)

        token = await self._auth.get_token()
        client = await self._auth._get_client()

        instances = [{"content": t} for t in texts]
        response = await client.post(
            f"{self._base_url()}:predict",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"instances": instances},
        )
        response.raise_for_status()
        return [pred["embeddings"]["values"] for pred in response.json()["predictions"]]
