"""File-based document source."""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path

from maree.models import Document
from maree.sources.base import Source

logger = logging.getLogger(__name__)

_PLAIN_EXTENSIONS = {".txt", ".md"}


class FileSource(Source):
    """Extract documents from local files.

    Supports .txt and .md natively. PDF extraction uses Docling when
    available; otherwise falls back to reading the raw bytes as text.
    """

    async def extract(self, path: str) -> list[Document]:
        root = Path(path)
        files = [root] if root.is_file() else sorted(root.rglob("*"))
        documents: list[Document] = []

        for file_path in files:
            if not file_path.is_file():
                continue

            ext = file_path.suffix.lower()
            if ext in _PLAIN_EXTENSIONS:
                content = file_path.read_text(encoding="utf-8", errors="replace")
            elif ext == ".pdf":
                content = _extract_pdf(file_path)
            else:
                continue

            doc_id = hashlib.sha256(str(file_path).encode()).hexdigest()[:16]
            stat = file_path.stat()
            metadata = {
                "filename": file_path.name,
                "extension": ext,
                "size_bytes": stat.st_size,
                "modified_at": stat.st_mtime,
            }
            documents.append(Document(id=doc_id, content=content, metadata=metadata))

        return documents


def _extract_pdf(path: Path) -> str:
    """Extract text from a PDF. Tries docling (best quality), then pypdf
    (small & fast), then raw bytes as a last resort."""
    try:
        from docling.document_converter import DocumentConverter  # type: ignore[import-untyped]

        converter = DocumentConverter()
        result = converter.convert(str(path))
        return result.document.export_to_text()
    except ImportError:
        pass

    try:
        from pypdf import PdfReader  # type: ignore[import-untyped]

        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(pages)
    except ImportError:
        logger.warning(
            "Neither docling nor pypdf installed -- reading PDF as raw text "
            "(install maree[docling] or pypdf for proper extraction)"
        )
        return path.read_text(encoding="utf-8", errors="replace")
