"""Pipeline orchestrator -- wires sources, processors, transformers, and stores."""

from __future__ import annotations

import logging

from maree.models import PipelineResult
from maree.processors.base import Processor
from maree.sources.base import Source
from maree.stores.base import Store
from maree.transformers.base import Transformer

logger = logging.getLogger(__name__)


class Pipeline:
    """Four-stage ingestion pipeline: extract -> process -> transform -> store."""

    def __init__(
        self,
        source: Source,
        processor: Processor,
        transformer: Transformer,
        store: Store,
    ) -> None:
        self.source = source
        self.processor = processor
        self.transformer = transformer
        self.store = store

    async def run(
        self, input_path: str, document_id: str | None = None
    ) -> PipelineResult:
        """Execute the full pipeline and return a summary.

        When ``document_id`` is provided and the source extracts exactly one
        document, its id is overridden so downstream chunks reference the
        caller-provided row (typically pre-created by recif-api). This avoids
        duplicate kb_documents rows when an external orchestrator owns the
        document lifecycle.
        """
        logger.info("extracting documents from %s", input_path)
        documents = await self.source.extract(input_path)
        logger.info("extracted %d document(s)", len(documents))

        if document_id is not None:
            if len(documents) == 1:
                documents[0].id = document_id
            else:
                logger.warning(
                    "--document-id ignored: expected exactly 1 document, got %d",
                    len(documents),
                )

        logger.info("chunking documents")
        chunks = await self.processor.process(documents)
        logger.info("produced %d chunk(s)", len(chunks))

        logger.info("generating embeddings")
        enriched = await self.transformer.transform(chunks)
        logger.info("enriched %d chunk(s)", len(enriched))

        # Delete old chunks for each document before upserting new ones.
        # This prevents stale chunks from a previous chunking strategy (e.g.
        # re-ingesting with SemanticChunker after TextChunker produced more
        # chunks — the higher-index old chunks would never be overwritten).
        for doc in documents:
            await self.store.delete_by_document(doc.id)

        logger.info("upserting to store")
        await self.store.upsert(enriched)

        result = PipelineResult(documents=len(documents), chunks=len(enriched))
        logger.info("pipeline complete: %s", result)
        return result
