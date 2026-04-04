"""Registry-based factory for document processors."""

from __future__ import annotations

import importlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from maree.processors.base import Processor

# Maps processor type name -> (module_path, class_name)
_REGISTRY: dict[str, tuple[str, str]] = {
    "text": ("maree.processors.text_chunker", "TextChunker"),
    "semantic": ("maree.processors.semantic_chunker", "SemanticChunker"),
}


def register_processor(name: str, module_path: str, class_name: str) -> None:
    """Register a custom processor type at runtime."""
    _REGISTRY[name] = (module_path, class_name)


def create_processor(name: str, **kwargs: object) -> Processor:
    """Instantiate a processor by its registered name."""
    entry = _REGISTRY.get(name)
    if entry is None:
        available = ", ".join(sorted(_REGISTRY))
        raise ValueError(f"Unknown processor type '{name}'. Available: {available}")

    module_path, class_name = entry
    module = importlib.import_module(module_path)
    cls = getattr(module, class_name)
    return cls(**kwargs)
