"""Taxonomy coverage: artifact enumerations must match the Python host maps and
Pydantic enums that switch on them. A new member without a host entry either
fails at runtime or silently takes a fallback.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.hop_solver import PRODUCT_FORM_UTILIZATION
from app.core.water import (
    ACID_PROPERTIES,
    ALKALINE_AGENT_EQUIV,
    GRAIN_ACIDITY,
    SALT_COEFFS,
)
from app.schemas.boundary import (
    AcidMedium,
    BatchSpargeTopology,
    MashPhStatus,
    PreferredAlkalineAgent,
    SaltDistribution,
    WaterStrategy,
)

ARTIFACT = json.loads(
    (Path(__file__).resolve().parents[3] / "data" / "artifact.json").read_text()
)


def taxonomy(taxonomy_id: str) -> set[str]:
    return set(ARTIFACT["taxonomies"][taxonomy_id])


def enum_values(enum) -> set[str]:
    return {member.value for member in enum}


CASES = [
    ("malt_category", set(GRAIN_ACIDITY)),
    ("whirlpool_hop_form", set(PRODUCT_FORM_UTILIZATION)),
    ("strategy", enum_values(WaterStrategy)),
    ("topology", enum_values(BatchSpargeTopology)),
    ("salt_distribution", enum_values(SaltDistribution)),
    ("acid_medium", enum_values(AcidMedium)),
    ("alkaline_agent", enum_values(PreferredAlkalineAgent)),
    ("ph_status", enum_values(MashPhStatus)),
]


@pytest.mark.parametrize(("taxonomy_id", "expected"), CASES)
def test_taxonomy_matches_host_map(taxonomy_id, expected):
    assert taxonomy(taxonomy_id) == expected, taxonomy_id


def test_acid_medium_matches_acid_properties():
    assert taxonomy("acid_medium") == set(ACID_PROPERTIES)


def test_alkaline_agent_matches_equivalent_weights_and_salt_coefficients():
    agents = taxonomy("alkaline_agent")
    assert agents == set(ALKALINE_AGENT_EQUIV)
    assert agents <= set(SALT_COEFFS)


@pytest.mark.parametrize("taxonomy_id", ["gypsum_form", "cacl2_form"])
def test_salt_forms_are_declared_in_salt_coefficients(taxonomy_id):
    assert taxonomy(taxonomy_id) <= set(SALT_COEFFS)
