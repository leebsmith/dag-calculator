"""Service adapter mapping the sealed batch-sparge solver onto its Pydantic contract.

``app.core`` is forbidden (by ``tach``) from importing ``app.schemas``, so this
module lives in ``app.services`` and is the sole seam between the pure
``solve_batch`` implementation (dataclasses) and the ``BatchSolverRequest`` /
``BatchSolverResponse`` boundary contract.
"""

from __future__ import annotations

from app.core.batch_solver import (
    BatchSolverInput,
    GrainBillEntry,
    SolverValidationError,
    solve_batch,
)
from app.schemas.boundary import (
    BatchCascadeOutputs,
    BatchHltOutputs,
    BatchSolverRequest,
    BatchSolverResponse,
)
from app.services.errors import SolverServiceError


def _to_input(req: BatchSolverRequest) -> BatchSolverInput:
    return BatchSolverInput(
        target_abv=req.target_abv,
        apparent_attenuation=req.apparent_attenuation,
        v_ferm=req.v_ferm,
        topology=req.topology.value,
        intensive_value=req.intensive_value,
        grain_bill=[
            GrainBillEntry(w_i=row.w_i, yield_i=row.yield_i, mc_i=row.mc_i)
            for row in req.grain_bill
        ],
        s_late_add=req.s_late_add,
        v_kettle_dead=req.v_kettle_dead,
        delta_v_evap=req.delta_v_evap,
        v_dead=req.v_dead,
        eta_conv=req.eta_conv,
        hlt_starting_volume_l=req.hlt_starting_volume_l,
        hlt_dead_space_l=req.hlt_dead_space_l,
        hlt_transfer_loss_l=req.hlt_transfer_loss_l,
        hlt_coil_floor_l=req.hlt_coil_floor_l,
        max_hlt_volume_l=req.max_hlt_volume_l,
        f_shrink=req.f_shrink,
    )


def _to_response(result) -> BatchSolverResponse:
    cascade = result.cascade
    hlt = result.hlt
    return BatchSolverResponse(
        sg_post_boil=result.sg_post_boil,
        v_pre_boil=result.v_pre_boil,
        s_post_boil_target=result.s_post_boil_target,
        m_grist=result.m_grist,
        cascade=BatchCascadeOutputs(
            v_strike=cascade.v_strike,
            v_run1=cascade.v_run1,
            v_run2=cascade.v_run2,
            v_sparge=cascade.v_sparge,
            s_run1=cascade.s_run1,
            s_run2=cascade.s_run2,
            sg_pre_boil=cascade.sg_pre_boil,
            v_post_boil=cascade.v_post_boil,
            mash_thickness_l_per_kg=cascade.mash_thickness_l_per_kg,
        ),
        max_achievable_abv=result.max_achievable_abv,
        hlt=BatchHltOutputs(
            v_hlt_debt=hlt.v_hlt_debt,
            v_hlt_after_strike=hlt.v_hlt_after_strike,
            v_hlt_top_up=hlt.v_hlt_top_up,
            v_sparge_deliverable=hlt.v_sparge_deliverable,
        ),
        mash_thickness_l_per_kg=result.mash_thickness_l_per_kg,
    )


def solve_batch_request(req: BatchSolverRequest) -> BatchSolverResponse:
    """Run the sealed batch-sparge solver over a validated request."""
    try:
        return _to_response(solve_batch(_to_input(req)))
    except SolverValidationError as exc:
        raise SolverServiceError(exc.code, exc.message) from exc
