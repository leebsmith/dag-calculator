"""Pydantic models for the BJCP styles seed (`data/seeds/styles.json`).

The seed is a flat id-keyed map (keyed by the BJCP style number, or a composite
`<number> <sub-name>` id for styles with sub-types); each component is a
`BJCPStyle`. Numeric vital-stat ranges are stored flat (`og_min`/`og_max`,
...) to match the artifact's `style` primitive schema.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, RootModel


class BJCPStyle(BaseModel):
    """A single BJCP style entry."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    category_id: str
    category_name: str
    type: Literal["beer", "mead", "cider"] = "beer"

    # Prose sections (the "-" placeholder is dropped at normalization, so these
    # are optional).
    overall_impression: str | None = None
    aroma: str | None = None
    appearance: str | None = None
    flavor: str | None = None
    mouthfeel: str | None = None
    comments: str | None = None
    history: str | None = None
    characteristic_ingredients: str | None = None
    style_comparison: str | None = None
    entry_instructions: str | None = None
    commercial_examples: str | None = None
    tags: str | None = None

    # Vital-stat ranges (absent for specialty styles that define none).
    og_min: float | None = None
    og_max: float | None = None
    fg_min: float | None = None
    fg_max: float | None = None
    ibu_min: float | None = None
    ibu_max: float | None = None
    srm_min: float | None = None
    srm_max: float | None = None
    abv_min: float | None = None
    abv_max: float | None = None


class StyleCatalog(RootModel[dict[str, BJCPStyle]]):
    """The whole styles seed: a flat map of style number -> style."""
