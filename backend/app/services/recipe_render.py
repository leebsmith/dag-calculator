"""Markdown renderer for the recipe document model.

Generic walk over the tree: no section-specific knowledge. Headings follow the
section depth, prose becomes paragraphs, values become key/value lines, tables
become pipe tables. Every value is already a display string.
"""

from __future__ import annotations

from app.schemas.recipe_document import (
    Group,
    Prose,
    RecipeDocument,
    Section,
    Table,
    Value,
)


def _cell(value: str | None) -> str:
    return (value or "").replace("|", "\\|").replace("\n", " ")


def _value_line(value: Value) -> str:
    rendered = value.value if value.value is not None else "—"
    unit = f" {value.unit_label}" if value.unit_label and value.value is not None else ""
    return f"**{value.label}:** {rendered}{unit}"


def _table(table: Table) -> list[str]:
    header = "| " + " | ".join(_cell(column.label) for column in table.columns) + " |"
    divider = "| " + " | ".join("---" for _ in table.columns) + " |"
    lines = [f"**{table.label}**", "", header, divider]
    for row in table.rows:
        cells = [_cell(row[index]) if index < len(row) else "" for index in range(len(table.columns))]
        lines.append("| " + " | ".join(cells) + " |")
    lines.append("")
    return lines


def _block(block: Value | Table | Group | Prose, depth: int) -> list[str]:
    if isinstance(block, Value):
        return [_value_line(block)]
    if isinstance(block, Prose):
        return [block.text]
    if isinstance(block, Table):
        return _table(block)
    if isinstance(block, Group):
        lines: list[str] = []
        if block.label:
            lines.extend([f"{'#' * min(depth + 1, 6)} {block.label}", ""])
        for child in block.blocks:
            lines.extend(_block(child, depth + 1))
        return lines
    raise TypeError(f"unknown block type {type(block)!r}")


def _section(section: Section, depth: int) -> list[str]:
    lines: list[str] = []
    if section.title:
        level = min(depth, 6)
        lines.extend([f"{'#' * level} {section.title}", ""])
    if section.subtitle:
        lines.extend([f"*{section.subtitle}*", ""])
    for paragraph in section.prose:
        lines.extend([paragraph, ""])
    for block in section.blocks:
        lines.extend(_block(block, depth))
        lines.append("")
    for subsection in section.subsections:
        lines.extend(_section(subsection, depth + 1))
    return lines


def render_markdown(document: RecipeDocument) -> str:
    lines: list[str] = [f"# {document.title}", ""]
    if document.subtitle:
        lines.extend([f"*{document.subtitle}*", ""])
    if document.meta:
        for key, value in document.meta.items():
            lines.append(f"- **{key}:** {value}")
        lines.append("")
    batch = document.identity.batch
    header = [
        ("Equipment", batch.equipment.get("name") or batch.equipment.get("id")),
        ("Water source", batch.water_source.get("laboratory") or batch.water_source.get("report_id")),
        ("Style", batch.style.get("name") or batch.style.get("id")),
    ]
    for label, value in header:
        if value:
            lines.append(f"- **{label}:** {value}")
    if any(value for _, value in header):
        lines.append("")
    for paragraph in document.prose:
        lines.extend([paragraph, ""])
    for section in document.sections:
        lines.extend(_section(section, 2))
    if document.identity.content_hash:
        lines.extend([f"<!-- document {document.identity.content_hash} -->", ""])
    return "\n".join(lines).rstrip() + "\n"
