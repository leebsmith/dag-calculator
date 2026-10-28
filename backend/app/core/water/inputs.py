"""The sealed boundary's input types."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from app.core.water.constants import DEFAULT_CALCIUM_FLOOR_PPM


@dataclass(frozen=True)
class GrainEntry:
    mass_kg: float
    color_lovibond: float
    grain_type: str


@dataclass(frozen=True)
class WaterChemistryInput:
    grist: Sequence[GrainEntry]
    source: dict  # Keys: ca, mg, na, so4, cl, alk (and optionally k, fe, mn, no3)
    target: dict  # Keys: ca, mg, na, so4, cl, alk (any subset or empty)
    v_mash_treat_l: float
    v_hlt_treat_l: float
    v_hlt_debt_l: float
    v_sparge_demand_l: float
    mash_thickness_l_per_kg: float
    target_mash_ph: float
    strategy: str = "AUTO"  # AUTO | FLAVOR | CALCIUM_FLOOR | OPTIMIZE | HYBRID | BASELINE | CUSTOM
    salt_distribution: str = "PROPORTIONAL"  # PROPORTIONAL | MASH_ONLY
    acid_medium: str = "LACTIC_88"
    gypsum_form: str = "GYPSUM_DIHYDRATE"
    cacl2_form: str = "CACL2_DIHYDRATE"
    preferred_alkaline_agent: str = "PICKLING_LIME"
    calcium_floor_ppm: float = DEFAULT_CALCIUM_FLOOR_PPM
    custom_pinned_ions: Sequence[str] = field(default_factory=tuple)
