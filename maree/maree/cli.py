"""Click CLI entry point for Maree."""

from __future__ import annotations

import asyncio
import logging

import click

from maree.config import MareeSettings
from maree.pipeline import Pipeline
from maree.processors.factory import create_processor
from maree.sources.factory import create_source
from maree.stores.factory import create_store
from maree.transformers.factory import create_transformer


@click.group()
@click.version_option(package_name="maree")
def main() -> None:
    """Maree -- Pluggable document ingestion pipeline for RAG."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )


@main.command()
@click.option("--source", "source_path", required=True, help="Path to documents.")
@click.option("--store-url", default=None, help="PostgreSQL DSN for pgvector.")
@click.option("--model", default=None, help="Ollama embedding model name.")
@click.option("--chunk-size", type=int, default=None, help="Characters per chunk.")
@click.option("--chunk-overlap", type=int, default=None, help="Overlap between chunks.")
@click.option("--kb-id", default="default", help="Knowledge base ID.")
@click.option(
    "--document-id",
    default=None,
    help=(
        "Override the generated document id for single-file runs. Used when "
        "an external caller (e.g. recif-api) has already created the "
        "kb_documents row and wants Marée to populate it instead of creating "
        "a parallel row."
    ),
)
def ingest(
    source_path: str,
    store_url: str | None,
    model: str | None,
    chunk_size: int | None,
    chunk_overlap: int | None,
    kb_id: str,
    document_id: str | None,
) -> None:
    """Ingest documents into the vector store."""
    settings = MareeSettings()

    if store_url is not None:
        settings.store_url = store_url
    if model is not None:
        settings.embedding_model = model
    if chunk_size is not None:
        settings.chunk_size = chunk_size
    if chunk_overlap is not None:
        settings.chunk_overlap = chunk_overlap

    source = create_source(settings.source_type)
    processor = create_processor(
        settings.processor_type,
        chunk_size=settings.chunk_size,
        overlap=settings.chunk_overlap,
    )
    transformer = create_transformer(
        settings.transformer_type,
        model=settings.embedding_model,
        base_url=settings.ollama_base_url,
    )
    store = create_store(settings.store_type, dsn=settings.store_url, kb_id=kb_id)

    pipeline = Pipeline(
        source=source,
        processor=processor,
        transformer=transformer,
        store=store,
    )

    result = asyncio.run(pipeline.run(source_path, document_id=document_id))
    click.echo(f"Ingested {result.documents} document(s), {result.chunks} chunk(s).")
