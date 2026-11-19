"""Sealed hop-bitterness boundary implementation.

Computes Tinseth boil utilization and the whirlpool Arrhenius integral over a
Newton cooling curve, and returns the curve it used (segments and forced chills)
so the client renders solved state instead of recomputing it.

Reference vectors live in ``docs/hops/whirlpool-hopping-model.md`` and the backend
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

PRODUCT_FORM_UTILIZATION: dict[str, float | None] = {
    "t90_pellet": 1.0,
    "flowable_extract": 1.15,
    "lupulin_pellet": 1.10,
    "whole_cone": None,
}

SIMPSON_TOLERANCE = 1e-10
SIMPSON_MAX_DEPTH = 20

# The hot/cool whirlpool split is cut by the isomerization floor: above the band
# the charge still bitter-isomerises freely, at or below it the stand mostly
# extracts flavour and aroma. The band lives in data/seeds/whirlpool-notes.json
# (`isomerization_floor`); a coupling test keeps this constant equal to its top.
ISOMERIZATION_FLOOR_C = 79.0

# How the IBU target reaches the hop charges. ``ibu_split`` divides it into a boil
# pool and a whirlpool pool and each row's ``pct`` is its share of its own pool.
# ``mass_pool`` spends the whole target across the kettle and both whirlpool
# stands; each row's ``mass_pct`` is its share of the hot-side mass and one scale
# factor sets the grams.
ALLOCATION_IBU_SPLIT = "ibu_split"
ALLOCATION_MASS_POOL = "mass_pool"
ALLOCATION_MODES = (ALLOCATION_IBU_SPLIT, ALLOCATION_MASS_POOL)

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
    product_form: str = "t90_pellet"
    cone_utilization: float | None = None
    mass_pct: float | None = None


@dataclass(frozen=True)
class WhirlpoolHopEntry:
    alpha_acid_pct: float
    addition_at_min: float
    initial_temp_c: float
    pct: float
    product_form: str = "t90_pellet"
    cone_utilization: float | None = None
    mass_pct: float | None = None


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
    whirlpool_knockout_min: float = 30.0
    whirlpool_start_temp_c: float = 99.0
    allocation_mode: str = ALLOCATION_IBU_SPLIT


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
    alpha_mass_kg: float | None = None


@dataclass(frozen=True)
class WhirlpoolHopResult:
    minutes: float
    ibu: float
    mass_kg: float | None
    effective_minutes: float
    alpha_mass_kg: float | None = None


@dataclass(frozen=True)
class HopSolverResult:
    boil_rows: Sequence[BoilHopResult]
    whirlpool_rows: Sequence[WhirlpoolHopResult]
    whirlpool_timeline: WhirlpoolTimeline
    boil_mass_kg: float
    whirlpool_mass_kg: float
    total_mass_kg: float
    whirlpool_hot_ibu: float
    whirlpool_cool_ibu: float
    boil_alpha_mass_kg: float = 0.0
    whirlpool_alpha_mass_kg: float = 0.0
    boil_ibu: float = 0.0
    whirlpool_hot_mass_kg: float = 0.0
    whirlpool_cool_mass_kg: float = 0.0
    mass_scale: float = 1.0


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
    product_form: str = "t90_pellet",
    cone_utilization: float | None = None,
) -> float | None:
    """Tinseth inverse: hop mass (kg) that yields ``ibu`` for a product form."""
    form = product_form_utilization(product_form, cone_utilization)
    if form is None:
        return None
    utilization = tinseth_utilization(boil_gravity_sg, time_min) * form
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
    product_form: str, cone_utilization: float | None = None
) -> float | None:
    """Lumped product-form efficiency: adsorption-free and dispersion.

    A flowable extract leaves no vegetative matter behind and its resin is
    already ruptured, so at boiling heat it delivers more IBU per unit of alpha
    than a T-90 pellet. The scalar carries both effects at once; the boil applies
    it isothermally, where heat and shear are at their maximum.

    Whole cone has no published figure, so the batch supplies it; a null result
    means the caller must refuse rather than guess.
    """
    value = PRODUCT_FORM_UTILIZATION.get(product_form, 1.0)
    if value is None:
        return cone_utilization
    return value


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
    cone_utilization: float | None = None,
) -> tuple[float | None, float]:
    """Whirlpool inverse: hop mass (kg) and effective minutes."""
    effective_minutes = effective_whirlpool_minutes(
        duration_min, initial_temp_c, ambient_temp_c, k_per_min
    )
    form = product_form_utilization(product_form, cone_utilization)
    if form is None:
        return None, effective_minutes
    utilization = whirlpool_utilization(gravity, effective_minutes) * form
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
    rows: Sequence[WhirlpoolHopEntry],
) -> list[tuple[float, float]]:
    """Group charges into (addition time, posted temperature), earliest first."""
    groups: list[list[float]] = []
    for row in sorted(rows, key=lambda entry: entry.addition_at_min):
        if (
            groups
            and abs(groups[-1][0] - row.addition_at_min) <= WHIRLPOOL_DURATION_TOLERANCE_MIN
        ):
            if abs(groups[-1][1] - row.initial_temp_c) > WHIRLPOOL_TEMP_TOLERANCE_C:
                raise SolverValidationError(
                    "WHIRLPOOL_ADDITION_CONFLICT",
                    f"Two whirlpool charges share a {row.addition_at_min:.1f}-minute addition "
                    f"but post {groups[-1][1]:.1f} °C and {row.initial_temp_c:.1f} °C; one "
                    "addition time cannot have two temperatures.",
                )
            continue
        groups.append([row.addition_at_min, row.initial_temp_c])
    return [(group[0], group[1]) for group in groups]


def build_whirlpool_timeline(
    rows: Sequence[WhirlpoolHopEntry],
    ambient_temp_c: float,
    k_per_min: float,
    knockout_min: float,
    start_temp_c: float,
) -> WhirlpoolTimeline:
    """One batch curve from heat-off to knockout, with a chill at each drop.

    The curve starts at ``(0, start_temp_c)`` and ends at ``knockout_min``, so a
    charge's addition time is its position in that window and its exposure is
    ``knockout - addition``. A posted temperature below the latent curve is a
    forced chill; above it means heating, which is rejected.
    """
    if knockout_min <= 0.0:
        return WhirlpoolTimeline(0.0, (), ())
    _require_above_ambient(0.0, start_temp_c, ambient_temp_c)
    additions = whirlpool_additions(rows)

    segments: list[tuple[float, float, float]] = []
    chills: list[WhirlpoolChill] = []
    current_time = 0.0
    current_temp = start_temp_c
    for at_min, posted_temp in additions:
        if at_min > knockout_min + WHIRLPOOL_DURATION_TOLERANCE_MIN:
            raise SolverValidationError(
                "INVALID_HOP_INPUT",
                f"Charge at {at_min:.1f} min is added after the {knockout_min:.1f}-min "
                "knockout; move it inside the window.",
            )
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
    if knockout_min > current_time + 1e-9:
        segments.append((current_time, knockout_min, current_temp))
    return WhirlpoolTimeline(knockout_min, tuple(segments), tuple(chills))


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


def _validate_targets(inputs: HopSolverInput) -> None:
    if not (inputs.boil_target_ibu >= 0.0) or not (inputs.whirlpool_target_ibu >= 0.0):
        raise SolverValidationError("INVALID_HOP_INPUT", "IBU targets must be non-negative.")
    if not (inputs.boil_time_min >= 0.0):
        raise SolverValidationError("INVALID_HOP_INPUT", "Boil time must be non-negative.")


def _validate_gravity(inputs: HopSolverInput) -> None:
    if not (inputs.pre_boil_gravity > 0.0) or not (inputs.post_boil_gravity > 0.0):
        raise SolverValidationError("INVALID_GRAVITY", "Gravity must be positive.")
    if not (inputs.post_boil_volume_l > 0.0):
        raise SolverValidationError("INVALID_VOLUME", "Post-boil volume must be positive.")
    if not (inputs.whirlpool_cooling_time_constant_min > 0.0):
        raise SolverValidationError(
            "INVALID_COOLING_CONSTANT", "Cooling time constant must be positive."
        )


def _validate_hop_fractions(row: BoilHopEntry | WhirlpoolHopEntry) -> None:
    if not (0.0 <= row.alpha_acid_pct <= 1.0) or not (0.0 <= row.pct <= 1.0):
        raise SolverValidationError("INVALID_HOP_INPUT", "Hop fractions must be 0..1.")


def _validate_product_form(row: BoilHopEntry | WhirlpoolHopEntry) -> None:
    if row.product_form not in PRODUCT_FORM_UTILIZATION:
        raise SolverValidationError(
            "UNKNOWN_PRODUCT_FORM", f"Unknown hop product form {row.product_form!r}."
        )


def _validate_cone(rows: Sequence[BoilHopEntry | WhirlpoolHopEntry]) -> None:
    for row in rows:
        if row.product_form == "whole_cone" and row.cone_utilization is None:
            raise SolverValidationError(
                "CONE_UTILIZATION_REQUIRED",
                "A whole-cone charge needs its utilization factor; supply one "
                "between 0 and 1 exclusive.",
            )


def _validate_boil_hops(rows: Sequence[BoilHopEntry]) -> None:
    for row in rows:
        _validate_hop_fractions(row)
        if not (0.0 <= row.boil_time_fraction <= 1.0):
            raise SolverValidationError(
                "INVALID_HOP_INPUT", "Boil-time fraction must be 0..1."
            )
        _validate_product_form(row)


def _validate_whirlpool_hops(rows: Sequence[WhirlpoolHopEntry]) -> None:
    for row in rows:
        _validate_hop_fractions(row)
        if not (row.addition_at_min >= 0.0):
            raise SolverValidationError(
                "INVALID_HOP_INPUT", "The addition time must be non-negative."
            )
        _validate_product_form(row)


def _validate_allocation(inputs: HopSolverInput) -> None:
    if inputs.allocation_mode not in ALLOCATION_MODES:
        raise SolverValidationError(
            "INVALID_HOP_INPUT", "Unknown hop allocation mode."
        )
    if inputs.allocation_mode != ALLOCATION_MASS_POOL:
        return
    for row in (*inputs.boil_hops, *inputs.whirlpool_hops):
        if row.mass_pct is not None and not (0.0 <= row.mass_pct <= 1.0):
            raise SolverValidationError("INVALID_HOP_INPUT", "Mass shares must be 0..1.")


def _validate(inputs: HopSolverInput) -> None:
    _validate_targets(inputs)
    _validate_gravity(inputs)
    _validate_boil_hops(inputs.boil_hops)
    _validate_whirlpool_hops(inputs.whirlpool_hops)
    _validate_cone((*inputs.boil_hops, *inputs.whirlpool_hops))
    _validate_allocation(inputs)


def _split_ibu(
    charges: Sequence[WhirlpoolHopEntry],
    results: Sequence[WhirlpoolHopResult],
    *,
    above_hot: bool,
) -> float:
    """IBU carried by the whirlpool charges on one side of the hot threshold."""
    total = 0.0
    for charge, result in zip(charges, results, strict=True):
        if (charge.initial_temp_c > ISOMERIZATION_FLOOR_C) is above_hot:
            total += result.ibu
    return total


def _split_mass(
    charges: Sequence[WhirlpoolHopEntry],
    results: Sequence[WhirlpoolHopResult],
    *,
    above_hot: bool,
) -> float:
    """Hop mass carried by the whirlpool charges on one side of the hot threshold."""
    total = 0.0
    for charge, result in zip(charges, results, strict=True):
        if result.mass_kg is None:
            continue
        if (charge.initial_temp_c > ISOMERIZATION_FLOOR_C) is above_hot:
            total += result.mass_kg
    return total


def _boil_ibu_per_kg(
    alpha_fraction: float, utilization: float, volume_l: float
) -> float | None:
    """IBU one kilogram of this charge would add, independent of how much is used."""
    if not (alpha_fraction > 0.0) or not (volume_l > 0.0) or utilization <= 0.0:
        return None
    volume_gal = volume_l / L_PER_GAL
    return utilization * alpha_fraction * TINSETH_FACTOR / (volume_gal * KG_PER_OZ)


def _whirlpool_ibu_per_kg(
    alpha_fraction: float, utilization: float, volume_l: float
) -> float | None:
    """Whirlpool equivalent of :func:`_boil_ibu_per_kg`."""
    if not (alpha_fraction > 0.0) or not (volume_l > 0.0) or utilization <= 0.0:
        return None
    return alpha_fraction * utilization * 1_000_000.0 / volume_l


def _solve_split(
    inputs: HopSolverInput, k_per_min: float
) -> tuple[list[BoilHopResult], list[WhirlpoolHopResult], WhirlpoolTimeline]:
    """Each row draws an IBU share of its own stage pool."""
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
            product_form=row.product_form,
            cone_utilization=row.cone_utilization,
        )
        boil_rows.append(
            BoilHopResult(
                minutes=minutes,
                ibu=ibu,
                mass_kg=mass,
                alpha_mass_kg=None if mass is None else mass * row.alpha_acid_pct,
            )
        )

    ambient_temp_c = inputs.whirlpool_ambient_temp_c
    timeline = build_whirlpool_timeline(
        inputs.whirlpool_hops,
        ambient_temp_c,
        k_per_min,
        inputs.whirlpool_knockout_min,
        inputs.whirlpool_start_temp_c,
    )
    whirlpool_rows: list[WhirlpoolHopResult] = []
    for row in inputs.whirlpool_hops:
        minutes = max(0.0, inputs.whirlpool_knockout_min - row.addition_at_min)
        ibu = row.pct * inputs.whirlpool_target_ibu
        effective_minutes = timeline.effective_minutes(
            row.addition_at_min, ambient_temp_c, k_per_min
        )
        form = product_form_utilization(row.product_form, row.cone_utilization)
        utilization = (
            0.0
            if form is None
            else whirlpool_utilization(inputs.post_boil_gravity, effective_minutes) * form
        )
        mass = mass_from_whirlpool_utilization(
            ibu, row.alpha_acid_pct, inputs.post_boil_volume_l, utilization
        )
        whirlpool_rows.append(
            WhirlpoolHopResult(
                minutes=minutes,
                ibu=ibu,
                mass_kg=mass,
                effective_minutes=effective_minutes,
                alpha_mass_kg=None if mass is None else mass * row.alpha_acid_pct,
            )
        )
    return boil_rows, whirlpool_rows, timeline


def _solve_pooled(
    inputs: HopSolverInput, k_per_min: float
) -> tuple[list[BoilHopResult], list[WhirlpoolHopResult], WhirlpoolTimeline, float]:
    """One pool: shares of the hot-side mass, scaled to the whole IBU target.

    IBU is linear in mass on both stages, so the shares fix the shape and a single
    scale factor lands the bill on the target. A charge with no usable yield drops
    out of the sum and keeps a null mass rather than a guessed one.
    """
    ambient_temp_c = inputs.whirlpool_ambient_temp_c
    volume_l = inputs.post_boil_volume_l
    timeline = build_whirlpool_timeline(
        inputs.whirlpool_hops,
        ambient_temp_c,
        k_per_min,
        inputs.whirlpool_knockout_min,
        inputs.whirlpool_start_temp_c,
    )

    boil_plan: list[tuple[float, float, float | None]] = []
    for row in inputs.boil_hops:
        minutes = row.boil_time_fraction * inputs.boil_time_min
        form = product_form_utilization(row.product_form, row.cone_utilization)
        utilization = (
            None
            if form is None
            else tinseth_utilization(inputs.pre_boil_gravity, minutes) * form
        )
        yield_per_kg = (
            None
            if utilization is None
            else _boil_ibu_per_kg(row.alpha_acid_pct, utilization, volume_l)
        )
        boil_plan.append((minutes, row.mass_pct or 0.0, yield_per_kg))

    whirlpool_plan: list[tuple[float, float, float, float | None]] = []
    for row in inputs.whirlpool_hops:
        minutes = max(0.0, inputs.whirlpool_knockout_min - row.addition_at_min)
        effective_minutes = timeline.effective_minutes(
            row.addition_at_min, ambient_temp_c, k_per_min
        )
        form = product_form_utilization(row.product_form, row.cone_utilization)
        utilization = (
            0.0
            if form is None
            else whirlpool_utilization(inputs.post_boil_gravity, effective_minutes) * form
        )
        yield_per_kg = (
            None
            if form is None
            else _whirlpool_ibu_per_kg(row.alpha_acid_pct, utilization, volume_l)
        )
        whirlpool_plan.append((minutes, effective_minutes, row.mass_pct or 0.0, yield_per_kg))

    target_ibu = inputs.boil_target_ibu + inputs.whirlpool_target_ibu
    denominator = sum(
        share * yield_per_kg
        for _, share, yield_per_kg in boil_plan
        if yield_per_kg is not None
    )
    denominator += sum(
        share * yield_per_kg
        for _, _, share, yield_per_kg in whirlpool_plan
        if yield_per_kg is not None
    )
    if not (target_ibu > 0.0) or not (denominator > 0.0):
        raise SolverValidationError(
            "INVALID_HOP_INPUT",
            "A mass pool needs a positive IBU target and at least one charge "
            "whose share and alpha can carry it.",
        )
    scale = target_ibu / denominator

    boil_rows: list[BoilHopResult] = []
    for row, (minutes, share, yield_per_kg) in zip(
        inputs.boil_hops, boil_plan, strict=True
    ):
        mass = None if yield_per_kg is None else share * scale
        boil_rows.append(
            BoilHopResult(
                minutes=minutes,
                ibu=0.0 if mass is None else mass * yield_per_kg,
                mass_kg=mass,
                alpha_mass_kg=None if mass is None else mass * row.alpha_acid_pct,
            )
        )

    whirlpool_rows: list[WhirlpoolHopResult] = []
    for row, (minutes, effective_minutes, share, yield_per_kg) in zip(
        inputs.whirlpool_hops, whirlpool_plan, strict=True
    ):
        mass = None if yield_per_kg is None else share * scale
        whirlpool_rows.append(
            WhirlpoolHopResult(
                minutes=minutes,
                ibu=0.0 if mass is None else mass * yield_per_kg,
                mass_kg=mass,
                effective_minutes=effective_minutes,
                alpha_mass_kg=None if mass is None else mass * row.alpha_acid_pct,
            )
        )
    return boil_rows, whirlpool_rows, timeline, scale


def solve_hops(inputs: HopSolverInput) -> HopSolverResult:
    """Resolve the hop-bitterness boundary."""
    _validate(inputs)
    k_per_min = 1.0 / inputs.whirlpool_cooling_time_constant_min
    scale = 1.0
    if inputs.allocation_mode == ALLOCATION_MASS_POOL:
        boil_rows, whirlpool_rows, timeline, scale = _solve_pooled(inputs, k_per_min)
    else:
        boil_rows, whirlpool_rows, timeline = _solve_split(inputs, k_per_min)

    boil_mass = sum(row.mass_kg for row in boil_rows if row.mass_kg is not None)
    whirlpool_mass = sum(row.mass_kg for row in whirlpool_rows if row.mass_kg is not None)
    return HopSolverResult(
        boil_rows=boil_rows,
        whirlpool_rows=whirlpool_rows,
        whirlpool_timeline=timeline,
        boil_mass_kg=boil_mass,
        whirlpool_mass_kg=whirlpool_mass,
        boil_alpha_mass_kg=sum(
            row.alpha_mass_kg for row in boil_rows if row.alpha_mass_kg is not None
        ),
        whirlpool_alpha_mass_kg=sum(
            row.alpha_mass_kg for row in whirlpool_rows if row.alpha_mass_kg is not None
        ),
        total_mass_kg=boil_mass + whirlpool_mass,
        whirlpool_hot_ibu=_split_ibu(
            inputs.whirlpool_hops, whirlpool_rows, above_hot=True
        ),
        whirlpool_cool_ibu=_split_ibu(
            inputs.whirlpool_hops, whirlpool_rows, above_hot=False
        ),
        boil_ibu=sum(row.ibu for row in boil_rows),
        whirlpool_hot_mass_kg=_split_mass(
            inputs.whirlpool_hops, whirlpool_rows, above_hot=True
        ),
        whirlpool_cool_mass_kg=_split_mass(
            inputs.whirlpool_hops, whirlpool_rows, above_hot=False
        ),
        mass_scale=scale,
    )
