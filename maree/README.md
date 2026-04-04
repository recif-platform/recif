# Maree

Pluggable document ingestion pipeline for RAG.

## Install

```bash
pip install -e ".[dev]"
```

## Usage

```bash
maree ingest --source ./docs/ --store-url "postgresql://user:pass@localhost:5432/maree" --model nomic-embed-text
```

## Architecture

Maree uses a four-stage pipeline with pluggable components:

1. **Source** -- extract documents from files, APIs, etc.
2. **Processor** -- chunk documents into smaller pieces
3. **Transformer** -- enrich chunks (embeddings, metadata)
4. **Store** -- persist enriched chunks to a vector store

Each stage uses a registry-based factory for extensibility.
