"""Sealed hop-bitterness boundary implementation.

Computes Tinseth boil utilization and the whirlpool Arrhenius integral over a
Newton cooling curve. The Python solver is the production path; the JavaScript
``views/hops.js`` / ``views/whirlpool.js`` copies are retained only as the
offline boundary stub.

Reference vectors live in ``docs/whirlpool-hopping-model.md`` and the backend
tests. All functions are pure and deterministic.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from app.core.errors import SolverValidationError

KG_PER_OZ = 0.028349523125
L_PER_GAL = 3.785411784
TINSETH_FACTOR = 7489.0

RATE_PREFACTOR = 2.39e11
RATE_EXPONENT_K = 9773.0

PRODUCT_FORM_UTILIZATION = {
    "t90_pellet": 1.0,
    "flowable_extract": 1.15,
    "lupulin_pellet": 1.10,
}

# Flowable extracts disperse poorly as the wort cools, so their multiplier is a
# smooth ramp between the two measured bounds instead of a constant: full value
# at 90 C and above, the low end at 75 C and below. T-90 pellets and lupulin
# pellets are static across the window (docs/hot-side-hopping-agent-dosing.md).
FLOWABLE_LOW_TEMP_C = 75.0
FLOWABLE_HIGH_TEMP_C = 90.0
FLOWABLE_LOW_UTILIZATION = 0.80

SIMPSON_TOLERANCE = 1e-10
SIMPSON_MAX_DEPTH = 20

# Whirlpool charges share one knockout end, so their durations also encode the
# addition order. Two charges within these tolerances are one addition, and the
# posted temperature is compared with the latent curve at that offset.
WHIRLPOOL_TEMP_TOLERANCE_C = 0.5
WHIRLPOOL_DURATION_TOLERANCE_MIN = 0.05


@dataclass(frozen=True)
class BoilHopEntry:
    alpha_acid_pct: float
    boil_time_fraction: float
    pct: float


@dataclass(frozen=True)
class WhirlpoolHopEntry:
    alpha_acid_pct: float
    duration_min: float
    initial_temp_c: float
    pct: float
    product_form: str = "t90_pellet"


@dataclass(frozen=True)
class HopSolverInput:
    boil_hops: Sequence[BoilHopEntry]
    whirlpool_hops: Sequence[WhirlpoolHopEntry]
    boil_target_ibu: float
    whirlpool_target_ibu: float
    boil_time_min: float
    pre_boil_gravity: float
    post_boil_gravity: float
    post_boil_volume_l: float
    whirlpool_ambient_temp_c: float
    whirlpool_cooling_time_constant_min: float


@dataclass(frozen=True)
class WhirlpoolChill:
    at_min: float
    from_temp_c: float
    to_temp_c: float


@dataclass(frozen=True)
class WhirlpoolTimeline:
    end_min: float
    segments: tuple[tuple[float, float, float], ...]
    chills: tuple[WhirlpoolChill, ...]

    def effective_minutes(
        self, start_min: float, ambient_temp_c: float, k_per_min: float
    ) -> float:
        """Boiling-equivalent time for a charge resting from ``start_min`` to the end."""
        total = 0.0
        for seg_start, seg_end, seg_temp in self.segments:
            lo = max(start_min, seg_start)
            if seg_end - lo <= 1e-12:
                continue
            offset = lo - seg_start
            temp_at_lo = cooling_temperature(
                offset, seg_temp, ambient_temp_c, k_per_min
            )
            total += effective_whirlpool_minutes(
                seg_end - lo, temp_at_lo, ambient_temp_c, k_per_min
            )
        return total


@dataclass(frozen=True)
class BoilHopResult:
    minutes: float
    ibu: float
    mass_kg: float | None


@dataclass(frozen=True)
class WhirlpoolHopResult:
    minutes: float
    ibu: float
    mass_kg: float | None
    effective_minutes: float


@dataclass(frozen=True)
class HopSolverResult:
    boil_rows: Sequence[BoilHopResult]
    whirlpool_rows: Sequence[WhirlpoolHopResult]
    boil_mass_kg: float
    whirlpool_mass_kg: float
    total_mass_kg: float


def tinseth_utilization(boil_gravity_sg: float, time_min: float) -> float:
    """Tinseth utilization fraction for a boil addition."""
    if not (boil_gravity_sg > 0.0) or not (time_min >= 0.0):
        return 0.0
    bigness = 1.65 * math.pow(0.000125, boil_gravity_sg - 1.0)
    time_factor = (1.0 - math.exp(-0.04 * time_min)) / 4.15
    return bigness * time_factor


def mass_from_ibu(
    ibu: float,
    alpha_fraction: float,
    time_min: float,
    boil_gravity_sg: float,
    volume_l: float,
) -> float | None:
    """Tinseth inverse: hop mass (kg) that yields ``ibu``."""
    utilization = tinseth_utilization(boil_gravity_sg, time_min)
    if (
        not (ibu > 0.0)
        or utilization <= 0.0
        or not (alpha_fraction > 0.0)
        or not (volume_l > 0.0)
    ):
        return None
    volume_gal = volume_l / L_PER_GAL
    mass_oz = (ibu * volume_gal) / (utilization * alpha_fraction * TINSETH_FACTOR)
    return mass_oz * KG_PER_OZ


def relative_isomerization_rate(temp_c: float) -> float:
    """Arrhenius rate relative to boiling."""
    kelvin = temp_c + 273.15
    if not (kelvin > 0.0):
        return 0.0
    return RATE_PREFACTOR * math.exp(-RATE_EXPONENT_K / kelvin)


def cooling_temperature(
    time_min: float,
    initial_temp_c: float,
    ambient_temp_c: float,
    k_per_min: float,
) -> float:
    """Newton cooling curve."""
    if not (time_min > 0.0):
        return initial_temp_c
    return ambient_temp_c + (initial_temp_c - ambient_temp_c) * math.exp(
        -k_per_min * time_min
    )


def _simpson(fn, a: float, b: float) -> float:
    mid = (a + b) / 2.0
    return ((b - a) / 6.0) * (fn(a) + 4.0 * fn(mid) + fn(b))


def _adaptive_simpson(
    fn,
    a: float,
    b: float,
    tolerance: float,
    whole: float,
    depth: int,
) -> float:
    mid = (a + b) / 2.0
    left = _simpson(fn, a, mid)
    right = _simpson(fn, mid, b)
    delta = left + right - whole
    if depth <= 0 or abs(delta) <= 15.0 * tolerance:
        return left + right + delta / 15.0
    return _adaptive_simpson(
        fn, a, mid, tolerance / 2.0, left, depth - 1
    ) + _adaptive_simpson(fn, mid, b, tolerance / 2.0, right, depth - 1)


def effective_whirlpool_minutes(
    duration_min: float,
    initial_temp_c: float,
    ambient_temp_c: float,
    k_per_min: float,
) -> float:
    """Boiling-equivalent contact time over the cooling curve."""
    if not (duration_min > 0.0):
        return 0.0
    if not math.isfinite(initial_temp_c) or not math.isfinite(ambient_temp_c):
        return 0.0
    if not math.isfinite(k_per_min) or k_per_min < 0.0:
        return 0.0
    start = max(initial_temp_c, ambient_temp_c)

    def rate(t: float) -> float:
        return relative_isomerization_rate(
            cooling_temperature(t, start, ambient_temp_c, k_per_min)
        )

    whole = _simpson(rate, 0.0, duration_min)
    return _adaptive_simpson(rate, 0.0, duration_min, SIMPSON_TOLERANCE, whole, SIMPSON_MAX_DEPTH)


def whirlpool_utilization(gravity: float, effective_minutes: float) -> float:
    if not (gravity > 0.0) or not (effective_minutes >= 0.0):
        return 0.0
    gravity_factor = 1.65 * math.pow(0.000125, gravity - 1.0)
    time_factor = (1.0 - math.exp(-0.04 * effective_minutes)) / 4.15
    return gravity_factor * time_factor


def product_form_utilization(
    product_form: str, temperature_c: float | None = None
) -> float:
    """Product-form scalar, temperature-dependent for flowable extracts."""
    base = PRODUCT_FORM_UTILIZATION.get(product_form, 1.0)
    if product_form != "flowable_extract" or temperature_c is None:
        return base
    if not math.isfinite(temperature_c):
        return base
    if temperature_c <= FLOWABLE_LOW_TEMP_C:
        return FLOWABLE_LOW_UTILIZATION
    if temperature_c >= FLOWABLE_HIGH_TEMP_C:
        return base
    ramp = (temperature_c - FLOWABLE_LOW_TEMP_C) / (
        FLOWABLE_HIGH_TEMP_C - FLOWABLE_LOW_TEMP_C
    )
    smooth = ramp * ramp * (3.0 - 2.0 * ramp)
    return FLOWABLE_LOW_UTILIZATION + smooth * (base - FLOWABLE_LOW_UTILIZATION)


def whirlpool_mass_kg(
    ibu: float,
    alpha_fraction: float,
    volume_l: float,
    gravity: float,
    duration_min: float,
    initial_temp_c: float,
    ambient_temp_c: float,
    k_per_min: float,
    product_form: str,
) -> tuple[float | None, float]:
    """Whirlpool inverse: hop mass (kg) and effective minutes."""
    effective_minutes = effective_whirlpool_minutes(
        duration_min, initial_temp_c, ambient_temp_c, k_per_min
    )
    utilization = whirlpool_utilization(gravity, effective_minutes) * product_form_utilization(
        product_form, initial_temp_c
    )
    return (
        mass_from_whirlpool_utilization(ibu, alpha_fraction, volume_l, utilization),
        effective_minutes,
    )


def _require_above_ambient(at_min: float, temp_c: float, ambient_temp_c: float) -> None:
    if temp_c < ambient_temp_c - WHIRLPOOL_TEMP_TOLERANCE_C:
        raise SolverValidationError(
            "WHIRLPOOL_BELOW_AMBIENT",
            f"Charge at {at_min:.1f} min posts {temp_c:.1f} °C, below the "
            f"{ambient_temp_c:.1f} °C ambient; the kettle only cools toward ambient, "
            "so a sub-ambient charge would have to warm.",
        )


def whirlpool_additions(
    rows: Sequence[WhirlpoolHopEntry], end_min: float
) -> list[tuple[float, float]]:
    """Group charges into (addition time, posted temperature), longest rest first."""
    groups: list[list[float]] = []
    for row in sorted(rows, key=lambda entry: entry.duration_min, reverse=True):
        if groups and abs(groups[-1][0] - row.duration_min) <= WHIRLPOOL_DURATION_TOLERANCE_MIN:
            if abs(groups[-1][2] - row.initial_temp_c) > WHIRLPOOL_TEMP_TOLERANCE_C:
                raise SolverValidationError(
                    "WHIRLPOOL_ADDITION_CONFLICT",
                    f"Two whirlpool charges share a {row.duration_min:.1f}-minute rest but "
                    f"post {groups[-1][2]:.1f} °C and {row.initial_temp_c:.1f} °C; one "
                    "addition time cannot have two temperatures.",
                )
            continue
        groups.append([row.duration_min, end_min - row.duration_min, row.initial_temp_c])
    return [(group[1], group[2]) for group in groups]


def build_whirlpool_timeline(
    rows: Sequence[WhirlpoolHopEntry], ambient_temp_c: float, k_per_min: float
) -> WhirlpoolTimeline:
    """One batch curve: passive between additions, an inferred chill at each drop.

    Every charge rests to knockout, so the longest rest starts at flameout and a
    charge's duration fixes its addition time. A posted temperature below the
    latent curve is a forced chill; above it means heating, which is rejected.
    """
    if not rows:
        return WhirlpoolTimeline(0.0, (), ())
    end_min = max(row.duration_min for row in rows)
    additions = whirlpool_additions(rows, end_min)
    first_at, first_temp = additions[0]
    _require_above_ambient(first_at, first_temp, ambient_temp_c)

    segments: list[tuple[float, float, float]] = []
    chills: list[WhirlpoolChill] = []
    current_time = 0.0
    current_temp = first_temp
    for at_min, posted_temp in additions[1:]:
        _require_above_ambient(at_min, posted_temp, ambient_temp_c)
        if at_min > current_time + 1e-9:
            segments.append((current_time, at_min, current_temp))
            current_temp = cooling_temperature(
                at_min - current_time, current_temp, ambient_temp_c, k_per_min
            )
            current_time = at_min
        if posted_temp > current_temp + WHIRLPOOL_TEMP_TOLERANCE_C:
            raise SolverValidationError(
                "WHIRLPOOL_HEATING",
                f"Charge at {at_min:.1f} min posts {posted_temp:.1f} °C, above the "
                f"{current_temp:.1f} °C the kettle reaches on the cooling curve; "
                "heating is not modelled.",
            )
        if posted_temp < current_temp - WHIRLPOOL_TEMP_TOLERANCE_C:
            chills.append(WhirlpoolChill(at_min, current_temp, posted_temp))
            current_temp = posted_temp
    if end_min > current_time + 1e-9:
        segments.append((current_time, end_min, current_temp))
    return WhirlpoolTimeline(end_min, tuple(segments), tuple(chills))


def mass_from_whirlpool_utilization(
    ibu: float, alpha_fraction: float, volume_l: float, utilization: float
) -> float | None:
    """Hop mass (kg) for an IBU share and an already-resolved utilization."""
    if (
        not (ibu > 0.0)
        or not (alpha_fraction > 0.0)
        or not (volume_l > 0.0)
        or utilization <= 0.0
    ):
        return None
    return (ibu * volume_l) / (alpha_fraction * 1000.0 * utilization) / 1000.0


def _validate(inputs: HopSolverInput) -> None:
    if not (inputs.boil_target_ibu >= 0.0) or not (inputs.whirlpool_target_ibu >= 0.0):
        raise SolverValidationError("INVALID_HOP_INPUT", "IBU targets must be non-negative.")
    if not (inputs.boil_time_min >= 0.0):
        raise SolverValidationError("INVALID_HOP_INPUT", "Boil time must be non-negative.")
    if not (inputs.pre_boil_gravity > 0.0) or not (inputs.post_boil_gravity > 0.0):
        raise SolverValidationError("INVALID_GRAVITY", "Gravity must be positive.")
    if not (inputs.post_boil_volume_l > 0.0):
        raise SolverValidationError("INVALID_VOLUME", "Post-boil volume must be positive.")
    if not (inputs.whirlpool_cooling_time_constant_min > 0.0):
        raise SolverValidationError(
            "INVALID_COOLING_CONSTANT", "Cooling time constant must be positive."
        )
    for row in inputs.boil_hops:
        if not (0.0 <= row.alpha_acid_pct <= 1.0) or not (0.0 <= row.pct <= 1.0):
            raise SolverValidationError("INVALID_HOP_INPUT", "Hop fractions must be 0..1.")
        if not (0.0 <= row.boil_time_fraction <= 1.0):
            raise SolverValidationError(
                "INVALID_HOP_INPUT", "Boil-time fraction must be 0..1."
            )
    for row in inputs.whirlpool_hops:
        if not (0.0 <= row.alpha_acid_pct <= 1.0) or not (0.0 <= row.pct <= 1.0):
            raise SolverValidationError("INVALID_HOP_INPUT", "Hop fractions must be 0..1.")
        if not (row.duration_min >= 0.0):
            raise SolverValidationError("INVALID_HOP_INPUT", "Rest duration must be non-negative.")
        if row.product_form not in PRODUCT_FORM_UTILIZATION:
            raise SolverValidationError(
                "UNKNOWN_PRODUCT_FORM", f"Unknown hop product form {row.product_form!r}."
            )


def solve_hops(inputs: HopSolverInput) -> HopSolverResult:
    """Resolve the hop-bitterness boundary."""
    _validate(inputs)
    k_per_min = 1.0 / inputs.whirlpool_cooling_time_constant_min

    boil_rows: list[BoilHopResult] = []
    for row in inputs.boil_hops:
        minutes = row.boil_time_fraction * inputs.boil_time_min
        ibu = row.pct * inputs.boil_target_ibu
        mass = mass_from_ibu(
            ibu,
            row.alpha_acid_pct,
            minutes,
            inputs.pre_boil_gravity,
            inputs.post_boil_volume_l,
        )
        boil_rows.append(BoilHopResult(minutes=minutes, ibu=ibu, mass_kg=mass))

    ambient_temp_c = inputs.whirlpool_ambient_temp_c
    timeline = build_whirlpool_timeline(
        inputs.whirlpool_hops, ambient_temp_c, k_per_min
    )
    whirlpool_rows: list[WhirlpoolHopResult] = []
    for row in inputs.whirlpool_hops:
        minutes = row.duration_min
        ibu = row.pct * inputs.whirlpool_target_ibu
        effective_minutes = timeline.effective_minutes(
            timeline.end_min - minutes, ambient_temp_c, k_per_min
        )
        utilization = whirlpool_utilization(
            inputs.post_boil_gravity, effective_minutes
        ) * product_form_utilization(row.product_form, row.initial_temp_c)
        mass = mass_from_whirlpool_utilization(
            ibu, row.alpha_acid_pct, inputs.post_boil_volume_l, utilization
        )
        whirlpool_rows.append(
            WhirlpoolHopResult(
                minutes=minutes,
                ibu=ibu,
                mass_kg=mass,
                effective_minutes=effective_minutes,
            )
        )

    boil_mass = sum(row.mass_kg for row in boil_rows if row.mass_kg is not None)
    whirlpool_mass = sum(row.mass_kg for row in whirlpool_rows if row.mass_kg is not None)
    return HopSolverResult(
        boil_rows=boil_rows,
        whirlpool_rows=whirlpool_rows,
        boil_mass_kg=boil_mass,
        whirlpool_mass_kg=whirlpool_mass,
        total_mass_kg=boil_mass + whirlpool_mass,
    )
