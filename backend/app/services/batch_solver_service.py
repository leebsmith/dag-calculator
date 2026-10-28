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
    ScalePreviewRow,
)
from app.services.errors import SolverServiceError
from app.services.parity import assert_field_parity

assert_field_parity(BatchSolverRequest, BatchSolverInput)


def _to_input(req: BatchSolverRequest) -> BatchSolverInput:
    return BatchSolverInput(
        target_abv=req.target_abv,
        scale_pin=req.scale_pin.value,
        target_og=req.target_og,
        target_fg=req.target_fg,
        malt_attenuation_cap=req.malt_attenuation_cap,
        sta1=req.sta1,
        v_ferm=req.v_ferm,
        topology=req.topology.value,
        intensive_value=req.intensive_value,
        grain_bill=[
            GrainBillEntry(
                w_i=row.w_i,
                yield_i=row.yield_i,
                mc_i=row.mc_i,
                fermentability_i=row.fermentability_i,
            )
            for row in req.grain_bill
        ],
        s_late_add=req.s_late_add,
        sugar_extract_share=req.sugar_extract_share,
        sugar_fermentability=req.sugar_fermentability,
        v_kettle_dead=req.v_kettle_dead,
        v_kettle_transfer=req.v_kettle_transfer,
        v_trub=req.v_trub,
        delta_v_evap=req.delta_v_evap,
        v_dead=req.v_dead,
        mash_transfer_loss=req.mash_transfer_loss,
        eta_conv=req.eta_conv,
        hlt_starting_volume_l=req.hlt_starting_volume_l,
        hlt_dead_space_l=req.hlt_dead_space_l,
        hlt_transfer_loss_l=req.hlt_transfer_loss_l,
        hlt_coil_floor_l=req.hlt_coil_floor_l,
        max_hlt_volume_l=req.max_hlt_volume_l,
        max_kettle_volume_l=req.max_kettle_volume_l,
        max_mash_tun_volume_l=req.max_mash_tun_volume_l,
        f_shrink=req.f_shrink,
        k_abs_true=req.k_abs_true,
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
            v_absorption=cascade.v_absorption,
            v_mc=cascade.v_mc,
            v_sol=cascade.v_sol,
            s_run1=cascade.s_run1,
            s_run2=cascade.s_run2,
            sg_pre_boil=cascade.sg_pre_boil,
            v_post_boil=cascade.v_post_boil,
        ),
        max_achievable_abv=result.max_achievable_abv,
        max_feasible_abv=result.max_feasible_abv,
        binding_constraint=result.binding_constraint,
        real_attenuation=result.real_attenuation,
        apparent_attenuation=result.apparent_attenuation,
        hlt=BatchHltOutputs(
            v_hlt_debt=hlt.v_hlt_debt,
            v_hlt_after_strike=hlt.v_hlt_after_strike,
            v_hlt_top_up=hlt.v_hlt_top_up,
            v_sparge_deliverable=hlt.v_sparge_deliverable,
            v_hlt_required=hlt.v_hlt_required,
            v_hlt_target=hlt.v_hlt_target,
        ),
        mash_thickness_l_per_kg=result.mash_thickness_l_per_kg,
        brewhouse_efficiency=result.brewhouse_efficiency,
        grist_attenuation=result.grist_attenuation,
        previews=[
            ScalePreviewRow(
                pin=row.pin,
                og=row.og,
                fg=row.fg,
                abv=row.abv,
                sugar_extract_share=row.sugar_extract_share,
                ok=row.ok,
                reason=row.reason,
            )
            for row in result.previews
        ],
    )


def solve_batch_request(req: BatchSolverRequest) -> BatchSolverResponse:
    """Run the sealed batch-sparge solver over a validated request."""
    try:
        return _to_response(solve_batch(_to_input(req)))
    except SolverValidationError as exc:
        raise SolverServiceError(exc.code, exc.message) from exc
