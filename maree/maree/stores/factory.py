"""Registry-based factory for vector stores."""

from __future__ import annotations

import importlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from maree.stores.base import Store

# Maps store type name -> (module_path, class_name)
_REGISTRY: dict[str, tuple[str, str]] = {
    "pgvector": ("maree.stores.pgvector", "PgVectorStore"),
}


def register_store(name: str, module_path: str, class_name: str) -> None:
    """Register a custom store type at runtime."""
    _REGISTRY[name] = (module_path, class_name)


def create_store(name: str, **kwargs: object) -> Store:
    """Instantiate a store by its registered name."""
    entry = _REGISTRY.get(name)
    if entry is None:
        available = ", ".join(sorted(_REGISTRY))
        raise ValueError(f"Unknown store type '{name}'. Available: {available}")

    module_path, class_name = entry
    module = importlib.import_module(module_path)
    cls = getattr(module, class_name)
    return cls(**kwargs)
