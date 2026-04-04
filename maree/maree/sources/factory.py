"""Registry-based factory for document sources."""

from __future__ import annotations

import importlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from maree.sources.base import Source

# Maps source type name -> (module_path, class_name)
_REGISTRY: dict[str, tuple[str, str]] = {
    "file": ("maree.sources.file_source", "FileSource"),
    "google_drive": ("maree.sources.connector", "GoogleDriveSource"),
    "jira": ("maree.sources.connector", "JiraSource"),
    "confluence": ("maree.sources.connector", "ConfluenceSource"),
    "databricks": ("maree.sources.connector", "DatabricksSource"),
}


def register_source(name: str, module_path: str, class_name: str) -> None:
    """Register a custom source type at runtime."""
    _REGISTRY[name] = (module_path, class_name)


def create_source(name: str, **kwargs: object) -> Source:
    """Instantiate a source by its registered name."""
    entry = _REGISTRY.get(name)
    if entry is None:
        available = ", ".join(sorted(_REGISTRY))
        raise ValueError(f"Unknown source type '{name}'. Available: {available}")

    module_path, class_name = entry
    module = importlib.import_module(module_path)
    cls = getattr(module, class_name)
    return cls(**kwargs)
