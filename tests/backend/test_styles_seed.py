"""Conformance test for the BJCP styles seed (data/seeds/styles.json)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.styles import BJCPStyle, StyleCatalog

SEED = Path(__file__).resolve().parents[2] / "data" / "seeds" / "styles.json"


def test_styles_seed_validates_and_is_id_keyed():
    data = json.loads(SEED.read_text())
    catalog = StyleCatalog.model_validate(data)

    assert len(catalog.root) == 116
    for key, style in catalog.root.items():
        assert style.id == key, f"style key {key!r} does not match id {style.id!r}"


def test_component_model_forbids_undeclared_fields():
    with pytest.raises(ValidationError):
        BJCPStyle.model_validate(
            {
                "id": "99Z",
                "name": "Bogus",
                "category_id": "99",
                "category_name": "Bogus",
                "bogus_field": 1,
            }
        )
