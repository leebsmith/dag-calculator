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
    WhirlpoolChill as WhirlpoolChillModel,
)
from app.schemas.boundary import (
    WhirlpoolHopResult as WhirlpoolHopResultModel,
)
from app.schemas.boundary import (
    WhirlpoolTimelineSegment as WhirlpoolTimelineSegmentModel,
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
                product_form=row.product_form.value,
                cone_utilization=row.cone_utilization,
            )
            for row in req.boil_hops
        ],
        whirlpool_hops=[
            WhirlpoolHopEntry(
                alpha_acid_pct=row.alpha_acid_pct,
                addition_at_min=row.addition_at_min,
                initial_temp_c=row.initial_temp_c,
                pct=row.pct,
                product_form=row.product_form.value,
                cone_utilization=row.cone_utilization,
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
        whirlpool_knockout_min=req.whirlpool_knockout_min,
        whirlpool_start_temp_c=req.whirlpool_start_temp_c,
    )


def _to_response(result: HopSolverResult) -> HopSolverResponse:
    return HopSolverResponse(
        boil_rows=[
            BoilHopResultModel(
                minutes=row.minutes,
                ibu=row.ibu,
                mass_kg=row.mass_kg,
                alpha_mass_kg=row.alpha_mass_kg,
            )
            for row in result.boil_rows
        ],
        whirlpool_rows=[
            WhirlpoolHopResultModel(
                minutes=row.minutes,
                ibu=row.ibu,
                mass_kg=row.mass_kg,
                effective_minutes=row.effective_minutes,
                alpha_mass_kg=row.alpha_mass_kg,
            )
            for row in result.whirlpool_rows
        ],
        whirlpool_timeline=[
            WhirlpoolTimelineSegmentModel(start_min=start, end_min=end, temp_c=temp)
            for start, end, temp in result.whirlpool_timeline.segments
        ],
        whirlpool_chills=[
            WhirlpoolChillModel(
                at_min=chill.at_min,
                from_temp_c=chill.from_temp_c,
                to_temp_c=chill.to_temp_c,
            )
            for chill in result.whirlpool_timeline.chills
        ],
        boil_mass_kg=result.boil_mass_kg,
        whirlpool_mass_kg=result.whirlpool_mass_kg,
        total_mass_kg=result.total_mass_kg,
        boil_alpha_mass_kg=result.boil_alpha_mass_kg,
        whirlpool_alpha_mass_kg=result.whirlpool_alpha_mass_kg,
        whirlpool_hot_ibu=result.whirlpool_hot_ibu,
        whirlpool_cool_ibu=result.whirlpool_cool_ibu,
    )


def solve_hop_request(req: HopSolverRequest) -> HopSolverResponse:
    """Run the sealed hop solver over a validated request."""
    try:
        return _to_response(solve_hops(_to_input(req)))
    except SolverValidationError as exc:
        raise SolverServiceError(exc.code, exc.message) from exc
