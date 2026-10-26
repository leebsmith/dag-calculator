"""The apparent→real conversion, its reference gravity, and its error bound.

Ingredient fermentability is stored as a **real** mass fraction of extract. The
producer's apparent observations convert at a fixed 12 °P reference; A2 in
``docs/attenuation-model.md`` bounds the error that fixed reference introduces
across 8–24 °P. The real-space priors are the converted old apparent values, so
displaying them again reproduces today's numbers within the tolerances below.
"""

from __future__ import annotations

import pytest

from app.core.utils import (
    apparent_extract_for_real_extract,
    apparent_to_real_attenuation,
)

REFERENCE_PLATO = 12.0

# real-space prior -> the apparent attenuation it displays at 12 °P.
ROUND_TRIP = [
    (0.643, 0.810),
    (0.398, 0.500),
    (0.121, 0.150),
]

# The audited real values (malt_database README) converted from apparent.
APPARENT_SOURCES = [
    (0.81, 0.643),
    (0.80, 0.635),
    (0.50, 0.398),
    (0.15, 0.121),
]

# A2: the fixed reference's worst displayed-AA error across 8–24 °P.
MAX_REFERENCE_ERROR = 0.025


def _apparent_for_real(real: float, oe: float) -> float:
    real_extract = oe * (1.0 - real)
    ae = apparent_extract_for_real_extract(oe, real_extract)
    return (oe - ae) / oe


def test_real_priors_display_the_old_apparent_values():
    for real, apparent in ROUND_TRIP:
        assert _apparent_for_real(real, REFERENCE_PLATO) == pytest.approx(
            apparent, abs=5e-4
        )


def test_apparent_source_figures_convert_to_the_audited_real_values():
    for apparent, real in APPARENT_SOURCES:
        assert apparent_to_real_attenuation(
            REFERENCE_PLATO, apparent
        ) == pytest.approx(real, abs=5e-4)


def test_conversion_error_bound_across_8_to_24_plato():
    for real, _apparent in ROUND_TRIP:
        reference = _apparent_for_real(real, REFERENCE_PLATO)
        worst = 0.0
        for index in range(0, 33):
            oe = 8.0 + index * 0.5
            worst = max(worst, abs(_apparent_for_real(real, oe) - reference))
        assert worst <= MAX_REFERENCE_ERROR, (
            f"real={real}: displayed AA moves {worst:.4f} across 8–24 °P "
            f"(bound {MAX_REFERENCE_ERROR})"
        )


def test_full_apparent_attenuation_converts_below_one():
    # 100 % apparent is not 100 % real: alcohol holds apparent extract at zero
    # while the Cutaia residue is still ~20 % of the extract at 12 °P.
    converted = apparent_to_real_attenuation(REFERENCE_PLATO, 1.0)
    assert converted == pytest.approx(
        1.0 - 0.49681569 * (0.372 + 0.00357 * REFERENCE_PLATO)
    )
    assert 0.75 < converted < 0.85
