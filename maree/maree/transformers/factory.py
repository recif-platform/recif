"""Registry-based factory for chunk transformers."""

from __future__ import annotations

import importlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from maree.transformers.base import Transformer

# Maps transformer type name -> (module_path, class_name)
_REGISTRY: dict[str, tuple[str, str]] = {
    "embedding": ("maree.transformers.embedding", "EmbeddingTransformer"),
    "vertex-embedding": ("maree.transformers.vertex_embedding", "VertexEmbeddingTransformer"),
}


def register_transformer(name: str, module_path: str, class_name: str) -> None:
    """Register a custom transformer type at runtime."""
    _REGISTRY[name] = (module_path, class_name)


def create_transformer(name: str, **kwargs: object) -> Transformer:
    """Instantiate a transformer by its registered name."""
    entry = _REGISTRY.get(name)
    if entry is None:
        available = ", ".join(sorted(_REGISTRY))
        raise ValueError(f"Unknown transformer type '{name}'. Available: {available}")

    module_path, class_name = entry
    module = importlib.import_module(module_path)
    cls = getattr(module, class_name)
    return cls(**kwargs)
