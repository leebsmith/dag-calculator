"""Service adapter mapping the sealed hop solver onto its Pydantic contract."""

from __future__ import annotations

from app.core.hop_solver import (
    BoilHopEntry,
    HopSolverInput,
    HopSolverResult,
    SolverValidationError,
    WhirlpoolHopEntry,
    solve_hops,
)
from app.schemas.boundary import (
    BoilHopResult as BoilHopResultModel,
)
from app.schemas.boundary import (
    HopSolverRequest,
    HopSolverResponse,
)
from app.schemas.boundary import (
    WhirlpoolHopResult as WhirlpoolHopResultModel,
)
from app.services.errors import SolverServiceError
from app.services.parity import assert_field_parity

assert_field_parity(HopSolverRequest, HopSolverInput)


def _to_input(req: HopSolverRequest) -> HopSolverInput:
    return HopSolverInput(
        boil_hops=[
            BoilHopEntry(
                alpha_acid_pct=row.alpha_acid_pct,
                boil_time_fraction=row.boil_time_fraction,
                pct=row.pct,
            )
            for row in req.boil_hops
        ],
        whirlpool_hops=[
            WhirlpoolHopEntry(
                alpha_acid_pct=row.alpha_acid_pct,
                duration_min=row.duration_min,
                initial_temp_c=row.initial_temp_c,
                pct=row.pct,
                product_form=row.product_form.value,
            )
            for row in req.whirlpool_hops
        ],
        boil_target_ibu=req.boil_target_ibu,
        whirlpool_target_ibu=req.whirlpool_target_ibu,
        boil_time_min=req.boil_time_min,
        pre_boil_gravity=req.pre_boil_gravity,
        post_boil_gravity=req.post_boil_gravity,
        post_boil_volume_l=req.post_boil_volume_l,
        whirlpool_ambient_temp_c=req.whirlpool_ambient_temp_c,
        whirlpool_cooling_time_constant_min=req.whirlpool_cooling_time_constant_min,
    )


def _to_response(result: HopSolverResult) -> HopSolverResponse:
    return HopSolverResponse(
        boil_rows=[
            BoilHopResultModel(
                minutes=row.minutes,
                ibu=row.ibu,
                mass_kg=row.mass_kg,
            )
            for row in result.boil_rows
        ],
        whirlpool_rows=[
            WhirlpoolHopResultModel(
                minutes=row.minutes,
                ibu=row.ibu,
                mass_kg=row.mass_kg,
                effective_minutes=row.effective_minutes,
            )
            for row in result.whirlpool_rows
        ],
        boil_mass_kg=result.boil_mass_kg,
        whirlpool_mass_kg=result.whirlpool_mass_kg,
        total_mass_kg=result.total_mass_kg,
    )


def solve_hop_request(req: HopSolverRequest) -> HopSolverResponse:
    """Run the sealed hop solver over a validated request."""
    try:
        return _to_response(solve_hops(_to_input(req)))
    except SolverValidationError as exc:
        raise SolverServiceError(exc.code, exc.message) from exc
