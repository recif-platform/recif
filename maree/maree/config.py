"""Configuration via pydantic-settings."""

from pydantic_settings import BaseSettings


class MareeSettings(BaseSettings):
    """Global settings, loadable from environment variables prefixed MAREE_."""

    model_config = {"env_prefix": "MAREE_"}

    # Source
    source_type: str = "file"

    # Processor
    processor_type: str = "semantic"
    chunk_size: int = 500
    chunk_overlap: int = 50

    # Transformer
    transformer_type: str = "embedding"
    embedding_model: str = "nomic-embed-text"
    ollama_base_url: str = "http://localhost:11434"

    # Store
    store_type: str = "pgvector"
    store_url: str = "postgresql://localhost:5432/maree"
