"""PDF text sidecar: the page text we use to *check* an extraction, not to feed it.

The extraction prompt reads the rendered document (layout, tables, imagery), so a
scan works as well as a text PDF. That leaves one gap: nothing can verify the
model's numbers mechanically, because the PDF is discarded. This module closes it
by recovering the text layer when one exists.

A page with almost no text is a scan. Callers treat that as "no sidecar" rather
than as empty text, so the scan path degrades to human review instead of a false
completeness claim.
"""

from __future__ import annotations

import io
import re

from pypdf import PdfReader

MIN_PAGE_CHARS = 40
_PAGE_RANGE = re.compile(r"(\d+)\s*(?:[-–]\s*(\d+))?")


class PdfTextError(Exception):
    """The document could not be read as a PDF."""


def page_texts(data: bytes) -> list[str]:
    """Per-page text, in document order. Unreadable pages become empty strings."""
    try:
        reader = PdfReader(io.BytesIO(data))
        return [(page.extract_text() or "") for page in reader.pages]
    except Exception as exc:
        raise PdfTextError(f"could not read the PDF's text layer: {type(exc).__name__}") from exc


def has_text_layer(pages: list[str]) -> bool:
    """True when the document carries real text rather than page images."""
    return any(len(text.strip()) >= MIN_PAGE_CHARS for text in pages)


def page_count(pages: list[str]) -> int:
    return len(pages)


def parse_page_range(hint: str | None, total: int) -> list[int] | None:
    """Read a hint like ``2``, ``2-3`` or ``pages 2–3`` into 1-based pages."""
    if not hint:
        return None
    match = _PAGE_RANGE.search(hint)
    if not match:
        return None
    first = int(match.group(1))
    last = int(match.group(2) or first)
    if first < 1 or last < first or first > total:
        return None
    return list(range(first, min(last, total) + 1))


def page_marked_text(pages: list[str], wanted: list[int] | None = None) -> str:
    """Text with page markers, so a re-read can attribute what it quotes."""
    selection = wanted or list(range(1, len(pages) + 1))
    blocks = []
    for number in selection:
        text = pages[number - 1].strip()
        if not text:
            continue
        blocks.append(f"--- page {number} ---\n{text}")
    return "\n\n".join(blocks)
