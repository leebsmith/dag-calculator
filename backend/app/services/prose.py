"""Markdown prose for reports and brew sessions.

Raw markdown is the stored fact. This module parses it into a small normalized
AST that the Typst templates render with content constructors. Nothing here
generates Typst source: strings stay data, so arbitrary prose cannot become
markup or code.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import logging
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from markdown_it import MarkdownIt
from markdown_it.tree import SyntaxTreeNode

PROSE_AST_VERSION = 1
MAX_SOURCE_CODE_POINTS = 20_000
MAX_NODES = 2_000
MAX_DEPTH = 32

_REPORT_TABLE_CELLS = {
    "report.hop_strategy": ("text",),
    "batch.process_notes": ("note",),
    "batch.brew_checklist": ("note",),
}

_parser = MarkdownIt(
    "commonmark",
    {
        "html": False,
        "linkify": False,
        "typographer": False,
        "breaks": False,
        "maxNesting": MAX_DEPTH + 8,
    },
)
_parser.enable("strikethrough")


def _allow_all_links(_url: str) -> bool:
    return True


_parser.validateLink = _allow_all_links

_log = logging.getLogger(__name__)


class ProseLimitError(ValueError):
    """The source exceeded a renderer budget."""


@dataclass
class _Budget:
    nodes: int = 0

    def spend(self, depth: int) -> None:
        if depth > MAX_DEPTH:
            raise ProseLimitError(f"nesting depth exceeded ({MAX_DEPTH})")
        self.nodes += 1
        if self.nodes > MAX_NODES:
            raise ProseLimitError(f"node count exceeded ({MAX_NODES})")


def safe_href(value: object) -> str | None:
    """Return a trimmed http(s) URL, or None when it would not stay clickable."""
    if not isinstance(value, str):
        return None
    href = value.strip()
    if not href or any(char.isspace() for char in href):
        return None
    try:
        parsed = urlsplit(href)
    except ValueError:
        return None
    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        return None
    return href


def parse_markdown(source: object) -> dict:
    """Normalize markdown into the AST the Typst renderer consumes."""
    text = source if isinstance(source, str) else ""
    if not text.strip():
        return {"type": "doc", "children": []}
    if len(text) > MAX_SOURCE_CODE_POINTS:
        _log.warning("prose source truncated at %s code points", MAX_SOURCE_CODE_POINTS)
        return _fallback(text)
    try:
        root = SyntaxTreeNode(_parser.parse(text))
        return {"type": "doc", "children": _block_nodes(root.children, 0, _Budget())}
    except ProseLimitError as exc:
        _log.warning("prose limit: %s", exc)
        return _fallback(text)
    except Exception:
        _log.warning("prose parse failed", exc_info=True)
        return _fallback(text)


def _fallback(text: str) -> dict:
    shown = text[:MAX_SOURCE_CODE_POINTS]
    if len(text) > MAX_SOURCE_CODE_POINTS:
        shown += "…"
    if not shown:
        return {"type": "doc", "children": []}
    return {
        "type": "doc",
        "children": [
            {"type": "paragraph", "children": [{"type": "text", "value": shown}]}
        ],
    }


def _block_nodes(children, depth: int, budget: _Budget) -> list[dict]:
    blocks: list[dict] = []
    for child in children:
        blocks.extend(_block_node(child, depth + 1, budget))
    return blocks


def _block_node(node: SyntaxTreeNode, depth: int, budget: _Budget) -> list[dict]:
    budget.spend(depth)
    kind = node.type
    if kind == "paragraph":
        return [_paragraph(node, depth, budget)]
    if kind == "heading":
        level = int(node.tag[1]) if node.tag and len(node.tag) > 1 else 1
        return [
            {
                "type": "heading",
                "level": min(max(level, 1), 3),
                "children": _inline_children(node, depth, budget),
            }
        ]
    if kind in ("bullet_list", "ordered_list"):
        return [_list_node(node, depth, budget)]
    if kind == "blockquote":
        return [{"type": "quote", "children": _block_nodes(node.children, depth, budget)}]
    if kind in ("fence", "code_block"):
        info = (node.info or "").strip()
        return [{"type": "code", "block": True, "text": node.content, "info": info}]
    if kind == "hr":
        return [{"type": "hr"}]
    if kind == "html_block":
        return [_text_paragraph(node.content)]
    if node.children:
        return [_text_paragraph(node.content)] if node.content else []
    if node.content:
        return [_text_paragraph(node.content)]
    return []


def _paragraph(node: SyntaxTreeNode, depth: int, budget: _Budget) -> dict:
    return {
        "type": "paragraph",
        "children": _inline_children(node, depth, budget),
    }


def _text_paragraph(text: str) -> dict:
    return {"type": "paragraph", "children": [{"type": "text", "value": text}]}


def _list_node(node: SyntaxTreeNode, depth: int, budget: _Budget) -> dict:
    ordered = node.type == "ordered_list"
    start = 1
    if ordered and node.info:
        try:
            start = int(node.info)
        except ValueError:
            start = 1
    items = [
        _block_nodes(item.children, depth, budget)
        for item in node.children
        if item.type == "list_item"
    ]
    return {"type": "list", "ordered": ordered, "start": start, "items": items}


def _inline_children(container: SyntaxTreeNode, depth: int, budget: _Budget) -> list[dict]:
    inline: list[dict] = []
    for child in container.children:
        if child.type == "inline":
            inline.extend(_inline_nodes(child.children, depth + 1, budget))
        else:
            inline.extend(_inline_node(child, depth + 1, budget))
    return inline


def _inline_nodes(children, depth: int, budget: _Budget) -> list[dict]:
    inline: list[dict] = []
    for child in children:
        inline.extend(_inline_node(child, depth + 1, budget))
    return inline


def _inline_node(node: SyntaxTreeNode, depth: int, budget: _Budget) -> list[dict]:
    budget.spend(depth)
    kind = node.type
    if kind == "text":
        return [{"type": "text", "value": node.content}]
    if kind == "softbreak":
        return [{"type": "text", "value": " "}]
    if kind == "hardbreak":
        return [{"type": "break"}]
    if kind in ("strong", "em", "s"):
        return [_wrapped_inline(kind, node, depth, budget)]
    if kind in ("code_inline", "code"):
        return [{"type": "code", "text": node.content}]
    if kind == "link":
        return _link_node(node, depth, budget)
    if kind == "image":
        alt = node.content or node.attrs.get("alt") or ""
        return [{"type": "text", "value": str(alt)}] if alt else []
    if kind == "html_inline":
        return [{"type": "text", "value": node.content}]
    return _unknown_inline(node, depth, budget)


def _wrapped_inline(kind: str, node: SyntaxTreeNode, depth: int, budget: _Budget) -> dict:
    mapped = {"em": "emph", "s": "strike"}.get(kind, kind)
    return {
        "type": mapped,
        "children": _inline_nodes(node.children, depth, budget),
    }


def _link_node(node: SyntaxTreeNode, depth: int, budget: _Budget) -> list[dict]:
    href = safe_href(node.attrs.get("href"))
    children = _inline_nodes(node.children, depth, budget)
    if href is None:
        return children
    return [
        {
            "type": "link",
            "href": href,
            "title": node.attrs.get("title"),
            "children": children,
        }
    ]


def _unknown_inline(node: SyntaxTreeNode, depth: int, budget: _Budget) -> list[dict]:
    if node.children:
        return _inline_nodes(node.children, depth, budget)
    return [{"type": "text", "value": node.content}] if node.content else []


def _enrich_cell(cell: object) -> None:
    if not isinstance(cell, dict):
        return
    text = cell.get("text")
    if not isinstance(text, str) or not text.strip() or text == "—":
        return
    cell["blocks"] = parse_markdown(text)


def enrich_bundle(payload: dict) -> dict:
    """Inject prose blocks into the report bundle's known prose cells."""
    tables = payload.get("formatted_tables")
    if not isinstance(tables, dict):
        return payload
    for collection, columns in _REPORT_TABLE_CELLS.items():
        rows = tables.get(collection)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            for column in columns:
                _enrich_cell(row.get(column))
    return payload


enrich_report = enrich_bundle


def enrich_session(session: dict) -> dict:
    """Inject prose blocks into the session document's free-text fields."""
    if not isinstance(session, dict):
        return session
    _enrich_scalar(session, "notes", "notes_prose")
    steps = session.get("steps")
    if isinstance(steps, dict):
        for step in steps.values():
            if not isinstance(step, dict):
                continue
            _enrich_scalar(step, "note", "note_prose")
            _enrich_scalar(step, "skip_reason", "skip_reason_prose")
    return session


def _enrich_scalar(container: dict, key: str, prose_key: str) -> None:
    text = container.get(key)
    if isinstance(text, str) and text.strip():
        container[prose_key] = parse_markdown(text)


_digest: str | None = None


def prose_digest() -> str:
    """A render-key component that changes with the parser or this module."""
    global _digest
    if _digest is None:
        version = importlib.metadata.version("markdown-it-py")
        material = Path(__file__).read_bytes()
        _digest = hashlib.sha256(
            material + version.encode("utf-8") + str(PROSE_AST_VERSION).encode("utf-8")
        ).hexdigest()
    return _digest
