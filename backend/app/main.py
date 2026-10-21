"""FastAPI application: the JSON seam between the browser and the sealed solvers.

The browser never talks to Firestore directly; it POSTs JSON to these routes and
receives JSON back. Both boundary endpoints delegate to the pure service
adapters, which wrap the sealed ``app.core`` solvers.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.auth.deps import AllowedUser, CurrentUser, session_payload
from app.schemas.batch import BatchPatch, BatchRecord, DraftPayload, FreezePayload
from app.schemas.boundary import (
    BatchSolverRequest,
    BatchSolverResponse,
    SolverErrorResponse,
    WaterSolverRequest,
    WaterSolverResponse,
)
from app.services import SolverServiceError, solve_batch_request, solve_water_request
from app.services.batch_service import BatchConflictError, BatchServiceDep

app = FastAPI(title="dag-calculator backend")


@app.get("/session")
def get_session(user: CurrentUser) -> dict:
    """Report whether the authenticated identity is allowlisted."""
    return session_payload(user)


@app.post("/solve/batch", response_model=BatchSolverResponse)
def solve_batch(req: BatchSolverRequest, _user: AllowedUser) -> BatchSolverResponse | JSONResponse:
    """Resolve the batch-sparge boundary (Brent root-finding)."""
    try:
        return solve_batch_request(req)
    except SolverServiceError as exc:
        return JSONResponse(
            status_code=422,
            content=SolverErrorResponse(
                code=exc.code, message=exc.message, details=exc.details
            ).model_dump(),
        )


@app.post("/solve/water", response_model=WaterSolverResponse)
def solve_water(req: WaterSolverRequest, _user: AllowedUser) -> WaterSolverResponse | JSONResponse:
    """Resolve the water-chemistry boundary (linear program)."""
    try:
        return solve_water_request(req)
    except SolverServiceError as exc:
        return JSONResponse(
            status_code=422,
            content=SolverErrorResponse(
                code=exc.code, message=exc.message, details=exc.details
            ).model_dump(),
        )


@app.get("/batches", response_model=list[BatchRecord])
def list_batches(user: AllowedUser, service: BatchServiceDep):
    """List the caller's batches (drafts and frozen)."""
    return service.list_batches(user["uid"])


@app.put("/batches/{batch_id}", response_model=BatchRecord)
def upsert_batch(
    batch_id: str,
    payload: DraftPayload,
    user: AllowedUser,
    service: BatchServiceDep,
):
    """Idempotently create-or-update a draft (client-owned id)."""
    try:
        return service.upsert_draft(user["uid"], batch_id, payload)
    except BatchConflictError as exc:
        return JSONResponse(
            status_code=409,
            content={
                "code": "CONFLICT",
                "message": str(exc),
                "details": {"reason": exc.reason},
            },
        )


@app.patch("/batches/{batch_id}", response_model=BatchRecord)
def patch_batch(
    batch_id: str,
    payload: BatchPatch,
    user: AllowedUser,
    service: BatchServiceDep,
):
    """Rename a batch and/or move it to trash (partial metadata update)."""
    if payload.name is not None:
        service.rename_batch(user["uid"], batch_id, payload.name)
    if payload.trashed is not None:
        service.set_trashed(user["uid"], batch_id, payload.trashed)
    return service.get_batch(user["uid"], batch_id)


@app.delete("/batches/{batch_id}", status_code=204)
def delete_batch(
    batch_id: str,
    user: AllowedUser,
    service: BatchServiceDep,
):
    """Permanently delete a batch owned by the caller."""
    service.delete_batch(user["uid"], batch_id)


@app.post("/batches/{batch_id}/freeze", response_model=BatchRecord, status_code=201)
def freeze_batch(
    batch_id: str,
    payload: FreezePayload,
    user: AllowedUser,
    service: BatchServiceDep,
):
    """Snapshot a draft's full valuation into an immutable frozen batch."""
    return service.freeze_batch(user["uid"], batch_id, payload)


@app.get("/batches/{batch_id}", response_model=BatchRecord)
def get_batch(
    batch_id: str,
    user: AllowedUser,
    service: BatchServiceDep,
):
    """Load a batch (draft or frozen) owned by the caller."""
    return service.get_batch(user["uid"], batch_id)
