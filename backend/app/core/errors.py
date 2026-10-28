"""Shared solver errors and the physical-capacity truth.

All three sealed boundaries (``solver.batch``, ``solver.water``,
``solver.hops``) raise the same ``SolverValidationError``. The capacity table is
the single declaration of which physical limit an error code names, which
``binding_constraint`` that limit reports, and what the failure says.
"""

from __future__ import annotations

from dataclasses import dataclass


class SolverValidationError(ValueError):
    """Raised when a solver's inputs fail a physical or numerical gate.

    Carries a machine-readable ``code`` alongside the human-readable message
    so the API layer can map it to a structured error response.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class CapacityLoads:
    """Measured capacity loads for one candidate batch, in liters.

    Attributes:
        v_pre_boil: Pre-boil kettle volume.
        peak_mash_tun_l: Largest mash or sparge tun occupancy.
        hlt_target_l: Liquor the HLT must hold before the sparge.
    """

    v_pre_boil: float
    peak_mash_tun_l: float
    hlt_target_l: float


@dataclass(frozen=True)
class CapacityLimit:
    """One physical capacity, its error code, and its binding-constraint key.

    Attributes:
        constraint: ``binding_constraint`` taxonomy member this limit reports.
        code: Solver error code raised when the limit is exceeded.
        load: ``CapacityLoads`` field carrying the measured load, in liters.
        cap: Solver-input attribute carrying the capacity, in liters.
        message: Error text with ``{load}`` and ``{cap}`` placeholders.
    """

    constraint: str
    code: str
    load: str
    cap: str
    message: str


CAPACITY_LIMITS: tuple[CapacityLimit, ...] = (
    CapacityLimit(
        constraint="kettle",
        code="KETTLE_TOO_SMALL",
        load="v_pre_boil",
        cap="max_kettle_volume_l",
        message=(
            "Kettle capacity exceeded: pre-boil volume {load:.1f} L exceeds "
            "{cap:.1f} L."
        ),
    ),
    CapacityLimit(
        constraint="tun",
        code="MASH_TUN_TOO_SMALL",
        load="peak_mash_tun_l",
        cap="max_mash_tun_volume_l",
        message=(
            "Mash tun capacity exceeded: the tun needs {load:.1f} L of "
            "{cap:.1f} L at the bracket bound."
        ),
    ),
    CapacityLimit(
        constraint="hlt",
        code="HLT_TOO_SMALL",
        load="hlt_target_l",
        cap="max_hlt_volume_l",
        message=(
            "HLT top-up target ({load:.2f} L) exceeds the HLT's maximum "
            "capacity ({cap:.2f} L). The HLT cannot hold enough liquor to "
            "cover the coil and deliver the sparge."
        ),
    ),
)
"""Table order is evaluation precedence: kettle, then tun, then HLT."""

CAPACITY_BY_CONSTRAINT: dict[str, CapacityLimit] = {
    limit.constraint: limit for limit in CAPACITY_LIMITS
}

CAPACITY_CODES: frozenset[str] = frozenset(
    limit.code for limit in CAPACITY_LIMITS
)

BINDING_BY_CODE: dict[str, str] = {
    **{limit.code: limit.constraint for limit in CAPACITY_LIMITS},
    "ABV_UNREACHABLE": "fermentation",
    "BRACKET_NO_SIGN_CHANGE": "volume",
    "DEGENERATE_BRACKET": "volume",
    "MASH_TOO_THIN": "volume",
    "EXTRACT_TARGET_NON_POSITIVE": "volume",
    "INVALID_YIELD": "volume",
}
"""Every infeasibility code and the ``binding_constraint`` it reports.

Capacity codes come from the table above; the rest have no capacity entry and
are attributed to the volume or fermentation ceiling they exhaust.
"""


def capacity_error(
    limit: CapacityLimit, load: float, cap: float
) -> SolverValidationError:
    """Build the error for one exceeded capacity limit."""
    return SolverValidationError(limit.code, limit.message.format(load=load, cap=cap))


def exceeded_capacity(
    loads: CapacityLoads, inputs: object
) -> tuple[CapacityLimit, float, float] | None:
    """Return the first exceeded limit with its measured load and capacity.

    Limits are evaluated in table order, so the reported constraint is
    deterministic when more than one is exceeded.
    """
    for limit in CAPACITY_LIMITS:
        load = getattr(loads, limit.load)
        cap = getattr(inputs, limit.cap)
        if load > cap:
            return limit, load, cap
    return None


def binding_constraint_for(code: str) -> str | None:
    """Resolve the ``binding_constraint`` an error code implies, if any.

    A ``None`` result means the code is unrelated to feasibility, so callers
    re-raise it instead of attributing the bound.
    """
    return BINDING_BY_CODE.get(code)
