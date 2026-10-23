"""Markdown rendering of the recipe document model."""

from __future__ import annotations

from app.schemas.recipe_document import (
    BatchIdentity,
    Column,
    DocumentIdentity,
    RecipeDocument,
    Section,
    Table,
    Value,
)
from app.services.recipe_render import render_markdown


def document(**overrides) -> RecipeDocument:
    base = dict(
        title="House Pale",
        subtitle="Single infusion",
        meta={"author": "lbs"},
        prose=["A simple pale ale."],
        identity=DocumentIdentity(
            schema_version=6,
            valuation_format="outputs",
            content_hash="abc123",
            batch=BatchIdentity(
                equipment={"id": "herms-30l", "name": "HERMS 30L"},
                water_source={"report_id": "southside-va-well", "laboratory": "Southside Virginia well"},
                style={"id": "21A", "name": "American IPA"},
            ),
        ),
    )
    base.update(overrides)
    return RecipeDocument(**base)


def test_renders_the_identity_header_from_the_snapshot() -> None:
    text = render_markdown(document())
    assert "- **Equipment:** HERMS 30L" in text
    assert "- **Water source:** Southside Virginia well" in text
    assert "- **Style:** American IPA" in text


def test_renders_sections_values_tables_and_nesting() -> None:
    section = Section(
        id="mash",
        title="Mash",
        prose=["Strike temperature is solved from the tun model."],
        blocks=[
            Value(label="Dough-in target", node="mash.dough_in_target_temp_c", value="67.0 °C"),
            Table(
                label="Mash steps",
                collection="mash.rests",
                columns=[Column(label="Step", field="rest_id"), Column(label="Temp", field="use_temp_c")],
                rows=[["Dough-in", "67.0 °C"]],
            ),
        ],
        subsections=[Section(id="strike", title="Strike water")],
    )
    text = render_markdown(document(sections=[section]))
    assert "## Mash" in text
    assert "**Dough-in target:** 67.0 °C" in text
    assert "| Step | Temp |" in text
    assert "| Dough-in | 67.0 °C |" in text
    assert "### Strike water" in text


def test_missing_values_render_as_absent_not_zero() -> None:
    text = render_markdown(
        document(sections=[Section(id="x", blocks=[Value(label="FG", node="batch.realized_fg")])])
    )
    assert "**FG:** —" in text


def test_table_cells_with_pipes_are_escaped() -> None:
    table = Table(
        label="Hops",
        collection="batch.boil_hops",
        columns=[Column(label="Name", field="name")],
        rows=[["Cascade | whole"]],
    )
    text = render_markdown(document(sections=[Section(id="hops", blocks=[table])]))
    assert r"Cascade \| whole" in text
