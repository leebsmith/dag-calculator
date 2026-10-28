"""The solver's application-side input types.

``GrainBillEntry`` is one malt component; ``BatchSolverInput`` is the frozen
bundle ``solve_batch`` consumes.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from app.core.batch.constants import F_SHRINK_DEFAULT, K_ABS_TRUE_METRIC
from app.core.errors import SolverValidationError


@dataclass(frozen=True)
class GrainBillEntry:
    """A single malt component of the grain bill.

    Attributes:
        w_i: Normalized mass fraction of this component (sum over the bill = 1.0).
        yield_i: Dry-basis fine-grind extract yield fraction (0..1).
        mc_i: As-is moisture content fraction (0..1).
    """

    w_i: float
    yield_i: float
    mc_i: float
    fermentability_i: float | None = None


@dataclass(frozen=True)
class BatchSolverInput:
    """Application-side inputs for a single batch-sparge solve.

    Attributes:
        target_abv: Desired alcohol by volume, as a percentage (e.g. 5.5).
        malt_attenuation_cap: The yeast's apparent attenuation cap as a fraction
            in (0, 1] (the strain's typical attenuation times the batch derate).
            Converted to real space per candidate ``OE`` before it clamps the
            malt's fermentability.
        v_ferm: Target cold fermenter volume, in liters.
        topology: Either ``"r_l_to_g"`` or ``"runoff_ratio"``.
        intensive_value: ``R_L:G`` (L/kg) or ``r`` (dimensionless).
        grain_bill: The malt specification vector.
        s_late_add: Late-addition extract mass, in kg.
        v_kettle_dead: Unrecoverable kettle/chiller dead space, in liters.
        v_kettle_transfer: Kettle/chiller transfer (hose/pump) loss, in liters.
        v_trub: Kettle trub loss, in liters.
        delta_v_evap: Calibrated kettle boil-off volume, in liters.
        v_dead: Mash tun dead space, in liters.
        mash_transfer_loss: Mash tun transfer (hose/pump) loss, in liters.
        eta_conv: Mash conversion efficiency as a fraction.
        f_shrink: Thermal contraction coefficient (default 4%).
        k_abs_true: Grain absorption coefficient, in L/kg. The equipment
            profile's ``grain_absorption_factor_l_per_kg`` is authoritative;
            the module constant is the fallback.
        sta1: Vendor STA1 QC result. ``True`` consumes the malt's dextrin
            residue (``d = 1``); ``False`` is an ordinary strain; ``None``
            means "not published" and models as ``d = 0`` with an advisory.
        sugar_extract_share: Sugar extract as a fraction of total post-boil
            extract. ``0`` means dose mode (``s_late_add`` is authoritative);
            a positive share is solved per candidate ``OE``.
        sugar_fermentability: Extract-weighted real fermentability of the
            late-addition blend (0..1).
        scale_pin: Which gravity/strength constraint is active:
            ``abv`` (default), ``og``, or ``fg``.
        target_og: Post-boil original gravity for the OG pin, SG. Ignored by
            the active solve when another pin is selected; used by the preview
            block.
        target_fg: Final gravity for the FG pin, SG. Same preview rule.
        hlt_starting_volume_l: Volume of liquor in the HLT at the start of the
            brew day, in liters. Batch-level parameter; the frontend pre-fills
            it from the equipment profile's ``max_hlt_volume_l``. Consumed by
            the HLT water budget (top-up and deliverable sparge volume), not
            by the extract mass balance.
        hlt_dead_space_l: Liquor trapped below the HLT drain port, in liters.
            Permanently undeliverable debt (see ``domain-equations.md`` §2.6).
        hlt_transfer_loss_l: Liquor permanently held in the HLT hose and pump,
            in liters. Permanently undeliverable debt.
        hlt_coil_floor_l: Minimum HLT volume required to submerge the HERMS
            coil, in liters. A constraint, not a debt.
        max_hlt_volume_l: Maximum HLT capacity, in liters. Used to gate the
            top-up target (``HLT_TOO_SMALL``).
        max_kettle_volume_l: Maximum kettle capacity, in liters. Diagnostic
            only: it never constrains the solve, but it bounds ``max_feasible_abv``
            and names a bracket failure.
        max_mash_tun_volume_l: Maximum mash tun capacity, in liters. Diagnostic
            only, like ``max_kettle_volume_l``.
    """

    target_abv: float
    malt_attenuation_cap: float
    v_ferm: float
    topology: str
    intensive_value: float
    grain_bill: Sequence[GrainBillEntry]
    s_late_add: float
    v_kettle_dead: float
    v_kettle_transfer: float
    v_trub: float
    delta_v_evap: float
    v_dead: float
    mash_transfer_loss: float
    eta_conv: float
    hlt_starting_volume_l: float
    hlt_dead_space_l: float
    hlt_transfer_loss_l: float
    hlt_coil_floor_l: float
    max_hlt_volume_l: float
    max_kettle_volume_l: float
    max_mash_tun_volume_l: float
    f_shrink: float = F_SHRINK_DEFAULT
    k_abs_true: float = K_ABS_TRUE_METRIC
    sta1: bool | None = None
    sugar_extract_share: float = 0.0
    sugar_fermentability: float = 1.0
    scale_pin: str = "abv"
    target_og: float | None = None
    target_fg: float | None = None

    def __post_init__(self) -> None:
        if self.topology not in ("r_l_to_g", "runoff_ratio"):
            raise SolverValidationError(
                "UNKNOWN_TOPOLOGY",
                f"Unknown constraint topology: {self.topology!r}.",
            )
        if self.scale_pin not in ("abv", "og", "fg"):
            raise SolverValidationError(
                "INVALID_SCALE_PIN",
                f"Unknown scale pin: {self.scale_pin!r}.",
            )
        if not math.isfinite(self.intensive_value) or self.intensive_value <= 0.0:
            raise SolverValidationError(
                "INVALID_INTENSIVE_VALUE",
                (
                    f"Intensive constraint must be positive and finite; got "
                    f"{self.intensive_value}."
                ),
            )
        if (
            not math.isfinite(self.sugar_extract_share)
            or self.sugar_extract_share < 0.0
            or self.sugar_extract_share >= 1.0
        ):
            raise SolverValidationError(
                "INVALID_SUGAR_SHARE",
                (
                    "Sugar extract share must be in [0, 1); got "
                    f"{self.sugar_extract_share}."
                ),
            )
        if (
            not math.isfinite(self.sugar_fermentability)
            or self.sugar_fermentability < 0.0
            or self.sugar_fermentability > 1.0
        ):
            raise SolverValidationError(
                "INVALID_SUGAR_FERMENTABILITY",
                (
                    "Sugar fermentability must be in [0, 1]; got "
                    f"{self.sugar_fermentability}."
                ),
            )
        if self.target_og is not None and (
            not math.isfinite(self.target_og) or self.target_og <= 0.0
        ):
            raise SolverValidationError(
                "INVALID_TARGET_OG",
                f"Target OG must be positive and finite; got {self.target_og}.",
            )
        if self.target_fg is not None and (
            not math.isfinite(self.target_fg) or self.target_fg <= 0.0
        ):
            raise SolverValidationError(
                "INVALID_TARGET_FG",
                f"Target FG must be positive and finite; got {self.target_fg}.",
            )
