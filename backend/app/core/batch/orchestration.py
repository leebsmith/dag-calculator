"""Orchestration: scale-pin resolution, the pipeline, and ``solve_batch``.

Resolves the active gravity/strength pin, runs the four phases in order,
measures the feasible-ABV bound against the capacity table, and assembles the
frozen result. ``solve_batch`` is the only entry point callers use.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from scipy.optimize import brentq

from app.core.batch.cascade import StageCascade, resolve_stage_cascade
from app.core.batch.composition import (
    WortComposition,
    asbc_plato_to_sg,
    max_achievable_abv,
    resolve_wort_composition,
    solve_oe_from_composition,
    solve_sg_post_boil_from_abv,
)
from app.core.batch.diagnostics import _capacity_loads, _diagnose_bracket
from app.core.batch.grist import solve_grist_mass
from app.core.batch.helpers import (
    brewhouse_efficiency,
    composite_fermentability_fraction,
    composite_moisture_fraction,
    composite_yield_fraction,
    grist_apparent_attenuation,
    validate_grain_bill_normalization,
)
from app.core.batch.hlt import HltWaterBudget, resolve_hlt_water_budget
from app.core.batch.inputs import BatchSolverInput
from app.core.batch.volumetric import (
    VolumetricReversal,
    kettle_cold_volume,
    require_malt_extract,
    resolve_extract_split,
    resolve_volumetric_reversal,
)
from app.core.errors import SolverValidationError, binding_constraint_for, exceeded_capacity
from app.core.utils import sg_to_plato


@dataclass(frozen=True)
class ScalePreview:
    """One hypothetical solve at a persisted scale target.

    Attributes:
        pin: ``abv``, ``og``, or ``fg``.
        og: Post-boil gravity at that target, SG (0 when infeasible).
        fg: Final gravity at that target, SG (0 when infeasible).
        abv: ABV at that target, % (0 when infeasible).
        sugar_extract_share: Sugar extract as a share of that row's total
            post-boil extract (0 when infeasible). A fixed dose is a
            different share at each candidate gravity.
        ok: Whether the target could be solved.
        reason: Error code (or empty) when ``ok`` is false.
    """

    pin: str
    og: float
    fg: float
    abv: float
    sugar_extract_share: float
    ok: bool
    reason: str


@dataclass(frozen=True)
class BatchSolverResult:
    """Full result of a batch-sparge solve.

    Attributes:
        sg_post_boil: Post-boil specific gravity from Phase 1.
        v_pre_boil: Derived pre-boil kettle volume, in liters.
        s_post_boil_target: Required post-boil extract mass, in kg.
        m_grist: Converged dry grist mass, in kg.
        cascade: The Phase 4 stage volume and gravity cascade.
        max_achievable_abv: The Phase 1 bracket ceiling for the given
            attenuation and composition, as a percentage. Echoed back so the
            frontend can bound the target-ABV input without duplicating the
            Cutaia model.
        real_attenuation: The solved batch's real attenuation (RDF), after the
            cap and any dextrin consumption.
        apparent_attenuation: The solved batch's apparent attenuation, after the
            cap and any dextrin consumption. May exceed 1 when diastaticus
            consumes the dextrin residue.
        hlt: The HLT water budget (top-up and deliverable sparge volume).
        max_feasible_abv: The largest target ABV that both solves and fits the
            rig's capacity limits, as a percentage.
        binding_constraint: Which limit sets ``max_feasible_abv``:
            ``fermentation``, ``volume``, ``tun``, ``kettle``, or ``hlt``.
        mash_thickness_l_per_kg: Resolved liquor-to-grist ratio, in L/kg.
            Surfaced at the top level (in addition to ``cascade``) because the
            Mash Card reads it directly to derive strike water temperature
            (design record Q3/Q12). Under ``r_l_to_g`` it equals the input
            ``R_L:G``; under ``runoff_ratio`` it is derived from the cascade.
        brewhouse_efficiency: Malt extract into the fermenter as a share of the
            grist's potential extract, excluding late additions. Always below
            ``conversion_efficiency`` because it also carries lauter retention.
        grist_attenuation: The grist's extract-weighted fermentability expressed
            as apparent attenuation at the solved OE. Below the yeast cap when
            the grist is the binding constraint; equal to the cap on the legacy
            scalar path.
        previews: One hypothetical gravity/strength row per scale pin, at that
            pin's persisted target. Diagnostics only; never the active solve.
    """

    sg_post_boil: float
    v_pre_boil: float
    s_post_boil_target: float
    m_grist: float
    cascade: StageCascade
    max_achievable_abv: float
    real_attenuation: float
    apparent_attenuation: float
    hlt: HltWaterBudget
    max_feasible_abv: float
    binding_constraint: str
    mash_thickness_l_per_kg: float
    brewhouse_efficiency: float
    grist_attenuation: float
    previews: tuple[ScalePreview, ...]


@dataclass(frozen=True)
class _Pipeline:
    sg_post_boil: float
    reversal: VolumetricReversal
    m_grist: float
    cascade: StageCascade
    hlt: HltWaterBudget
    real_attenuation: float
    apparent_attenuation: float
    max_abv: float
    brewhouse_efficiency: float
    grist_attenuation: float


def _capacity_violation(inputs: BatchSolverInput, pipeline: _Pipeline) -> str | None:
    loads = _capacity_loads(
        inputs, pipeline.reversal.v_pre_boil, pipeline.m_grist, pipeline.cascade
    )
    exceeded = exceeded_capacity(loads, inputs)
    if exceeded is None:
        return None
    return exceeded[0].constraint


@dataclass(frozen=True)
class _GravityState:
    oe_plato: float
    sg_post_boil: float
    extract_total_kg: float
    sugar_extract_kg: float
    composition: WortComposition


def _target_for(inputs: BatchSolverInput, pin: str) -> float | None:
    if pin == "abv":
        return inputs.target_abv
    if pin == "og":
        return inputs.target_og
    if pin == "fg":
        return inputs.target_fg
    raise SolverValidationError(
        "INVALID_SCALE_PIN", f"Unknown scale pin: {pin!r}."
    )


def _abv_ceiling(
    inputs: BatchSolverInput,
    v_kettle_cold: float,
    aa_malt: float,
    dextrin_consumption: float,
) -> float:
    ceiling = resolve_extract_split(
        asbc_plato_to_sg(40.0),
        v_kettle_cold,
        inputs.sugar_extract_share,
        inputs.s_late_add,
    )
    if ceiling.malt_extract_kg <= 0.0:
        return 0.0
    return resolve_wort_composition(
        oe_plato=40.0,
        extract_total_kg=ceiling.extract_total_kg,
        s_late_add=ceiling.sugar_extract_kg,
        malt_fermentability=aa_malt,
        yeast_cap_apparent=inputs.malt_attenuation_cap,
        dextrin_consumption=dextrin_consumption,
        sugar_fermentability=inputs.sugar_fermentability,
    ).abv_pct


def _resolve_gravity(
    inputs: BatchSolverInput,
    pin: str,
    target: float | None,
    v_kettle_cold: float,
    aa_malt: float,
    dextrin_consumption: float,
) -> _GravityState:
    """Resolve OE, extract and composition for one active scale pin."""

    if pin == "abv":
        oe_plato = solve_oe_from_composition(
            target_abv=target if target is not None else 0.0,
            yeast_cap_apparent=inputs.malt_attenuation_cap,
            malt_fermentability=aa_malt,
            v_kettle_cold=v_kettle_cold,
            s_late_add=inputs.s_late_add,
            dextrin_consumption=dextrin_consumption,
            sugar_extract_share=inputs.sugar_extract_share,
            sugar_fermentability=inputs.sugar_fermentability,
        )
        sg_post_boil = asbc_plato_to_sg(oe_plato)
        split = resolve_extract_split(
            sg_post_boil, v_kettle_cold, inputs.sugar_extract_share, inputs.s_late_add
        )
    elif pin == "og":
        if target is None or not math.isfinite(target) or target <= 1.0:
            raise SolverValidationError(
                "INVALID_TARGET_OG",
                f"Target OG must be greater than 1.000; got {target}.",
            )
        sg_post_boil = target
        oe_plato = sg_to_plato(sg_post_boil)
        split = resolve_extract_split(
            sg_post_boil, v_kettle_cold, inputs.sugar_extract_share, inputs.s_late_add
        )
    elif pin == "fg":
        if target is None or not math.isfinite(target) or target <= 0.0:
            raise SolverValidationError(
                "INVALID_TARGET_FG",
                f"Target FG must be positive; got {target}.",
            )
        if target < 1.0 and inputs.sta1 is not True:
            raise SolverValidationError(
                "FG_BELOW_ZERO_WITHOUT_STA1",
                (
                    "An FG below 1.000 requires a diastaticus strain "
                    "(sta1 = true); select one or raise the target."
                ),
            )
        target_ae = sg_to_plato(target)

        def residual(oe_plato: float) -> float | None:
            sg = asbc_plato_to_sg(oe_plato)
            split = resolve_extract_split(
                sg, v_kettle_cold, inputs.sugar_extract_share, inputs.s_late_add
            )
            if split.malt_extract_kg <= 0.0:
                # No malt extract at this candidate: outside the physical
                # domain, not a residual to bracket.
                return None
            composition = resolve_wort_composition(
                oe_plato=oe_plato,
                extract_total_kg=split.extract_total_kg,
                s_late_add=split.sugar_extract_kg,
                malt_fermentability=aa_malt,
                yeast_cap_apparent=inputs.malt_attenuation_cap,
                dextrin_consumption=dextrin_consumption,
                sugar_fermentability=inputs.sugar_fermentability,
            )
            return composition.apparent_extract_plato - target_ae

        grid = [1e-9, 0.5, 1.0, 2.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0]
        bracket = None
        previous_oe = None
        previous = None
        for candidate in grid:
            current = residual(candidate)
            if current is None:
                previous_oe = None
                previous = None
                continue
            if abs(current) < 1e-12:
                bracket = (candidate, candidate)
                break
            if previous is not None and previous * current < 0.0:
                bracket = (previous_oe, candidate)
                break
            previous_oe, previous = candidate, current
        if bracket is None:
            raise SolverValidationError(
                "FG_UNREACHABLE",
                (
                    f"Target FG {target:.4f} is not reachable within the "
                    "0-40 °P bracket at this composition."
                ),
            )
        if bracket[0] == bracket[1]:
            oe_plato = bracket[0]
        else:
            oe_plato = brentq(
                lambda x: residual(x)  # type: ignore[arg-type]
                if residual(x) is not None
                else 0.0,
                bracket[0],
                bracket[1],
            )
        sg_post_boil = asbc_plato_to_sg(oe_plato)
        split = resolve_extract_split(
            sg_post_boil, v_kettle_cold, inputs.sugar_extract_share, inputs.s_late_add
        )
    else:
        raise SolverValidationError(
            "INVALID_SCALE_PIN", f"Unknown scale pin: {pin!r}."
        )

    require_malt_extract(split)
    composition = resolve_wort_composition(
        oe_plato=oe_plato,
        extract_total_kg=split.extract_total_kg,
        s_late_add=split.sugar_extract_kg,
        malt_fermentability=aa_malt,
        yeast_cap_apparent=inputs.malt_attenuation_cap,
        dextrin_consumption=dextrin_consumption,
        sugar_fermentability=inputs.sugar_fermentability,
    )
    return _GravityState(
        oe_plato=oe_plato,
        sg_post_boil=sg_post_boil,
        extract_total_kg=split.extract_total_kg,
        sugar_extract_kg=split.sugar_extract_kg,
        composition=composition,
    )


def _preview_rows(
    inputs: BatchSolverInput,
    v_kettle_cold: float,
    aa_malt: float,
    dextrin_consumption: float,
) -> tuple[ScalePreview, ...]:
    rows: list[ScalePreview] = []
    for pin in ("abv", "og", "fg"):
        try:
            state = _resolve_gravity(
                inputs,
                pin,
                _target_for(inputs, pin),
                v_kettle_cold,
                aa_malt,
                dextrin_consumption,
            )
        except SolverValidationError as exc:
            rows.append(ScalePreview(pin, 0.0, 0.0, 0.0, 0.0, False, exc.code))
            continue
        composition = state.composition
        share = (
            composition.sugar_extract_kg / composition.extract_total_kg
            if composition.extract_total_kg > 0.0
            else 0.0
        )
        rows.append(
            ScalePreview(
                pin,
                state.sg_post_boil,
                asbc_plato_to_sg(composition.apparent_extract_plato),
                composition.abv_pct,
                share,
                True,
                "",
            )
        )
    return tuple(rows)


def _solve_pipeline(
    inputs: BatchSolverInput, pin: str, target: float | None
) -> _Pipeline:
    validate_grain_bill_normalization(inputs.grain_bill)
    yield_fraction = composite_yield_fraction(inputs.grain_bill)
    mc_bar = composite_moisture_fraction(inputs.grain_bill)
    aa_malt = composite_fermentability_fraction(inputs.grain_bill)

    # A diastaticus strain consumes the malt's dextrin residue (d = 1). An
    # unknown status is modelled as d = 0 and surfaced as a host-side finding,
    # never as a silent negative.
    dextrin_consumption = 1.0 if inputs.sta1 is True else 0.0

    v_kettle_cold = kettle_cold_volume(
        inputs.v_ferm, inputs.v_kettle_dead, inputs.f_shrink
    )

    def solve_phase_1(aa: float):
        sg = solve_sg_post_boil_from_abv(
            target if target is not None else 0.0, aa
        )
        rev = resolve_volumetric_reversal(
            v_ferm=inputs.v_ferm,
            sg_post_boil=sg,
            v_kettle_dead=inputs.v_kettle_dead,
            v_kettle_transfer=inputs.v_kettle_transfer,
            v_trub=inputs.v_trub,
            delta_v_evap=inputs.delta_v_evap,
            s_late_add=inputs.s_late_add,
            f_shrink=inputs.f_shrink,
        )
        return sg, rev

    if aa_malt is None:
        # Legacy scalar path: a caller that supplies no per-row fermentability
        # keeps the original apparent-attenuation inversion. Share mode and the
        # OG/FG pins are composition features and have no meaning without it.
        if pin != "abv" or inputs.sugar_extract_share > 0.0:
            raise SolverValidationError(
                "INVALID_SCALE_PIN",
                (
                    "This scale pin requires per-row fermentability; the grain "
                    "bill omits it."
                ),
            )
        cap = inputs.malt_attenuation_cap
        apparent_attenuation = cap
        real_attenuation = cap
        sg_post_boil, reversal = solve_phase_1(apparent_attenuation)
        max_abv = max_achievable_abv(apparent_attenuation)
        s_late_add = inputs.s_late_add
        oe_plato = sg_to_plato(sg_post_boil)
    else:
        state = _resolve_gravity(
            inputs, pin, target, v_kettle_cold, aa_malt, dextrin_consumption
        )
        sg_post_boil = state.sg_post_boil
        s_late_add = state.sugar_extract_kg
        reversal = resolve_volumetric_reversal(
            v_ferm=inputs.v_ferm,
            sg_post_boil=sg_post_boil,
            v_kettle_dead=inputs.v_kettle_dead,
            v_kettle_transfer=inputs.v_kettle_transfer,
            v_trub=inputs.v_trub,
            delta_v_evap=inputs.delta_v_evap,
            s_late_add=s_late_add,
            f_shrink=inputs.f_shrink,
        )
        composition = state.composition
        real_attenuation = composition.real_attenuation
        apparent_attenuation = composition.apparent_attenuation
        max_abv = _abv_ceiling(
            inputs, v_kettle_cold, aa_malt, dextrin_consumption
        )
        oe_plato = state.oe_plato

    try:
        m_grist = solve_grist_mass(
            v_pre_boil=reversal.v_pre_boil,
            r_l_to_g=inputs.intensive_value,
            yield_fraction=yield_fraction,
            mc_bar=mc_bar,
            eta_conv=inputs.eta_conv,
            s_post_boil_target=reversal.s_post_boil_target,
            s_late_add=s_late_add,
            v_dead=inputs.v_dead,
            k_abs_true=inputs.k_abs_true,
            topology=inputs.topology,
            mash_transfer_loss=inputs.mash_transfer_loss,
        )
    except SolverValidationError as exc:
        if exc.code in ("BRACKET_NO_SIGN_CHANGE", "DEGENERATE_BRACKET"):
            cause = _diagnose_bracket(
                inputs, reversal, yield_fraction, mc_bar, inputs.eta_conv, s_late_add
            )
            if cause is not None:
                raise cause from exc
        raise

    cascade = resolve_stage_cascade(
        m_grist=m_grist,
        v_pre_boil=reversal.v_pre_boil,
        topology=inputs.topology,
        intensive_value=inputs.intensive_value,
        yield_fraction=yield_fraction,
        mc_bar=mc_bar,
        eta_conv=inputs.eta_conv,
        v_dead=inputs.v_dead,
        delta_v_evap=inputs.delta_v_evap,
        mash_transfer_loss=inputs.mash_transfer_loss,
        k_abs_true=inputs.k_abs_true,
    )

    hlt = resolve_hlt_water_budget(
        hlt_starting_volume_l=inputs.hlt_starting_volume_l,
        v_strike_drawn=cascade.v_strike,
        v_sparge_demand=cascade.v_sparge,
        hlt_dead_space_l=inputs.hlt_dead_space_l,
        hlt_transfer_loss_l=inputs.hlt_transfer_loss_l,
        hlt_coil_floor_l=inputs.hlt_coil_floor_l,
        max_hlt_volume_l=inputs.max_hlt_volume_l,
    )

    return _Pipeline(
        sg_post_boil=sg_post_boil,
        reversal=reversal,
        m_grist=m_grist,
        cascade=cascade,
        hlt=hlt,
        real_attenuation=real_attenuation,
        apparent_attenuation=apparent_attenuation,
        max_abv=max_abv,
        brewhouse_efficiency=brewhouse_efficiency(
            extract_total_kg=reversal.s_post_boil_target,
            sugar_extract_kg=s_late_add,
            m_grist=m_grist,
            yield_fraction=yield_fraction,
            v_ferm=inputs.v_ferm,
            v_kettle_cold=v_kettle_cold,
        ),
        grist_attenuation=grist_apparent_attenuation(
            oe_plato=oe_plato,
            real_fermentability=aa_malt,
            fallback=inputs.malt_attenuation_cap,
        ),
    )


def _feasible_bound(
    inputs: BatchSolverInput, fermentation_ceiling: float
) -> tuple[float, str]:
    def probe(target_abv: float) -> str | None:
        if target_abv <= 0.0:
            return "volume"
        try:
            pipeline = _solve_pipeline(inputs, "abv", target_abv)
        except SolverValidationError as exc:
            reason = binding_constraint_for(exc.code)
            if reason is None:
                raise
            return reason
        return _capacity_violation(inputs, pipeline)

    low = None
    low_reason = None
    for candidate in range(1, 20):
        reason = probe(float(candidate))
        if reason is None:
            low = float(candidate)
            break
        if low_reason is None:
            low_reason = reason
    if low is None:
        return 0.0, low_reason or "volume"

    high = max(fermentation_ceiling, low)
    high_reason = probe(high)
    if high_reason is None:
        return high, "fermentation"

    for _ in range(30):
        mid = (low + high) / 2.0
        if probe(mid) is None:
            low = mid
        else:
            high = mid
    return low, probe(high) or "fermentation"


def solve_batch(inputs: BatchSolverInput) -> BatchSolverResult:
    """Top-level orchestrator composing Phases 1-4.

    Pipeline:

    1. Phase 1: isolate the active scale target (ABV, OG, or FG) and the
       composition block.
    2. Phase 2: reverse kettle mechanics to derive ``V_pre_boil`` and
       ``S_post_boil_target``.
    3. Phase 3: resolve ``M_grist`` via Brent's method.
    4. Phase 4: cascade stage volumes and gravities.

    The feasible-ABV bound is found by bisecting the ABV pipeline against the
    rig's capacity limits; it never changes the active target solve. The preview
    rows are diagnostics at the three persisted targets.

    Args:
        inputs: The frozen ``BatchSolverInput`` bundle.

    Returns:
        A frozen ``BatchSolverResult`` with all derived anchors.

    Raises:
        SolverValidationError: Propagated from any phase's validation gate. A
            bracket failure is replaced by a named capacity code when the
            upper-bound check is definitive.

    See ``domain-equations.md`` §2.5.
    """
    pin = inputs.scale_pin
    target = _target_for(inputs, pin)
    pipeline = _solve_pipeline(inputs, pin, target)
    fermentation_ceiling = pipeline.max_abv
    max_feasible_abv, binding_constraint = _feasible_bound(
        inputs, fermentation_ceiling
    )

    aa_malt = composite_fermentability_fraction(inputs.grain_bill)
    has_sugar = inputs.s_late_add > 0.0 or inputs.sugar_extract_share > 0.0
    if not has_sugar:
        # The preview matrix is a sugar-composition diagnostic. 85% of batches
        # never open it, so skip the three lightweight solves entirely.
        previews = ()
    elif aa_malt is None:
        previews = tuple(
            ScalePreview(p, 0.0, 0.0, 0.0, 0.0, False, "INVALID_ATTENUATION")
            for p in ("abv", "og", "fg")
        )
    else:
        v_kettle_cold = kettle_cold_volume(
            inputs.v_ferm, inputs.v_kettle_dead, inputs.f_shrink
        )
        dextrin_consumption = 1.0 if inputs.sta1 is True else 0.0
        previews = _preview_rows(
            inputs, v_kettle_cold, aa_malt, dextrin_consumption
        )

    return BatchSolverResult(
        sg_post_boil=pipeline.sg_post_boil,
        v_pre_boil=pipeline.reversal.v_pre_boil,
        s_post_boil_target=pipeline.reversal.s_post_boil_target,
        m_grist=pipeline.m_grist,
        cascade=pipeline.cascade,
        max_achievable_abv=fermentation_ceiling,
        real_attenuation=pipeline.real_attenuation,
        apparent_attenuation=pipeline.apparent_attenuation,
        hlt=pipeline.hlt,
        max_feasible_abv=max_feasible_abv,
        binding_constraint=binding_constraint,
        mash_thickness_l_per_kg=pipeline.cascade.mash_thickness_l_per_kg,
        brewhouse_efficiency=pipeline.brewhouse_efficiency,
        grist_attenuation=pipeline.grist_attenuation,
        previews=previews,
    )
