"""Semantic chunker — paragraph-based splitting with sentence boundary awareness.

Splits on double newlines (paragraphs), groups paragraphs into chunks up to
max_chunk_size, and splits oversized paragraphs at sentence boundaries.
No external NLP dependencies — pure regex + fallback.
"""

from __future__ import annotations

import hashlib
import re

from maree.models import Chunk, Document
from maree.processors.base import Processor

# Sentence boundary: period/exclamation/question followed by whitespace and an
# uppercase letter or digit. Negative lookbehind skips common abbreviations.
_SENTENCE_RE = re.compile(
    r"(?<![A-Z][a-z])"  # skip abbreviations like "Dr." "Mr." "St."
    r"(?<=[.!?])\s+"
    r"(?=[A-Z0-9])"
)


class SemanticChunker(Processor):
    """Split documents into semantic chunks based on paragraphs and sentences."""

    def __init__(
        self,
        max_chunk_size: int = 1000,
        overlap_sentences: int = 1,
        # Accept TextChunker-compatible kwargs so the CLI works without changes
        chunk_size: int | None = None,
        overlap: int | None = None,
        **_kwargs: object,
    ) -> None:
        effective_size = chunk_size if chunk_size is not None else max_chunk_size
        if effective_size <= 0:
            raise ValueError("max_chunk_size must be positive")
        self.max_chunk_size = effective_size
        self.overlap_sentences = overlap if overlap is not None else overlap_sentences

    async def process(self, documents: list[Document]) -> list[Chunk]:
        chunks: list[Chunk] = []
        for doc in documents:
            chunks.extend(self._chunk_document(doc))
        return chunks

    def _split_paragraphs(self, text: str) -> list[str]:
        """Split on double newlines, filter empty."""
        return [p.strip() for p in text.split("\n\n") if p.strip()]

    def _split_sentences(self, paragraph: str) -> list[str]:
        """Split a paragraph into sentences. Falls back to character-based
        splitting when regex produces no splits (non-Latin text, etc.)."""
        parts = _SENTENCE_RE.split(paragraph)
        if len(parts) <= 1:
            # Fallback: character-based split at word boundaries
            return self._split_by_size(paragraph)
        return [s.strip() for s in parts if s.strip()]

    @staticmethod
    def _joined_len(parts: list[str]) -> int:
        """Length of ' '.join(parts) without allocating the string."""
        if not parts:
            return 0
        return sum(len(s) for s in parts) + len(parts) - 1

    def _split_by_size(self, text: str) -> list[str]:
        """Character-based fallback: split at word boundaries near max_chunk_size."""
        if len(text) <= self.max_chunk_size:
            return [text]

        chunks: list[str] = []
        while text:
            if len(text) <= self.max_chunk_size:
                chunks.append(text)
                break
            # Find a word boundary near max_chunk_size
            split_at = text.rfind(" ", 0, self.max_chunk_size)
            if split_at <= 0:
                split_at = self.max_chunk_size
            chunks.append(text[:split_at].strip())
            text = text[split_at:].strip()
        return chunks

    def _chunk_document(self, doc: Document) -> list[Chunk]:
        paragraphs = self._split_paragraphs(doc.content)
        if not paragraphs:
            return []

        chunks: list[Chunk] = []
        current_parts: list[str] = []
        current_len = 0
        last_sentences: list[str] = []  # For overlap

        def _flush(index: int) -> int:
            if not current_parts:
                return index
            text = "\n\n".join(current_parts)
            chunk_id = hashlib.sha256(f"{doc.id}:{index}".encode()).hexdigest()[:16]
            chunks.append(Chunk(
                id=chunk_id,
                document_id=doc.id,
                content=text,
                chunk_index=index,
                metadata={**doc.metadata},
            ))
            return index + 1

        chunk_idx = 0
        for para in paragraphs:
            para_len = len(para)

            if para_len > self.max_chunk_size:
                # Flush current buffer first
                chunk_idx = _flush(chunk_idx)
                current_parts.clear()
                current_len = 0

                # Split oversized paragraph into sentences
                sentences = self._split_sentences(para)
                sent_buf: list[str] = list(last_sentences)  # Start with overlap
                sent_len = self._joined_len(sent_buf)

                for sent in sentences:
                    # +1 for the space separator when joining
                    added_len = len(sent) + (1 if sent_buf else 0)
                    if sent_len + added_len > self.max_chunk_size and sent_buf:
                        text = " ".join(sent_buf)
                        cid = hashlib.sha256(f"{doc.id}:{chunk_idx}".encode()).hexdigest()[:16]
                        chunks.append(Chunk(
                            id=cid,
                            document_id=doc.id,
                            content=text,
                            chunk_index=chunk_idx,
                            metadata={**doc.metadata},
                        ))
                        chunk_idx += 1
                        # Overlap: keep last N sentences
                        last_sentences = sent_buf[-self.overlap_sentences:] if self.overlap_sentences else []
                        sent_buf = list(last_sentences)
                        sent_len = self._joined_len(sent_buf)
                        added_len = len(sent) + (1 if sent_buf else 0)

                    sent_buf.append(sent)
                    sent_len += added_len

                if sent_buf:
                    text = " ".join(sent_buf)
                    cid = hashlib.sha256(f"{doc.id}:{chunk_idx}".encode()).hexdigest()[:16]
                    chunks.append(Chunk(
                        id=cid,
                        document_id=doc.id,
                        content=text,
                        chunk_index=chunk_idx,
                        metadata={**doc.metadata},
                    ))
                    chunk_idx += 1
                    last_sentences = sent_buf[-self.overlap_sentences:] if self.overlap_sentences else []

                continue

            # Normal paragraph — check if it fits in current chunk
            needed = para_len + (2 if current_parts else 0)  # \n\n separator
            if current_len + needed > self.max_chunk_size and current_parts:
                chunk_idx = _flush(chunk_idx)
                # Overlap: use last sentences from flushed content
                if self.overlap_sentences and current_parts:
                    last_text = current_parts[-1]
                    overlap_sents = self._split_sentences(last_text)
                    last_sentences = overlap_sents[-self.overlap_sentences:]
                current_parts.clear()
                current_len = 0

                # Prepend overlap
                if last_sentences:
                    overlap_text = " ".join(last_sentences)
                    current_parts.append(overlap_text)
                    current_len = len(overlap_text)

            current_parts.append(para)
            current_len += needed

        # Flush remaining
        _flush(chunk_idx)

        return chunks
