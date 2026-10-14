"""FastAPI application: the JSON seam between the browser and the sealed solvers.

The browser never talks to Firestore directly; it POSTs JSON to these routes and
receives JSON back. Both boundary endpoints delegate to the pure service
adapters, which wrap the sealed ``app.core`` solvers.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.auth.deps import CurrentUser
from app.schemas.batch import BatchRecord, DraftPayload, FreezePayload
from app.schemas.boundary import (
    BatchSolverRequest,
    BatchSolverResponse,
    SolverErrorResponse,
    WaterSolverRequest,
    WaterSolverResponse,
)
from app.services import SolverServiceError, solve_batch_request, solve_water_request
from app.services.batch_service import BatchServiceDep

app = FastAPI(title="dag-calculator backend")


@app.post("/solve/batch", response_model=BatchSolverResponse)
def solve_batch(req: BatchSolverRequest, _user: CurrentUser) -> BatchSolverResponse | JSONResponse:
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
def solve_water(req: WaterSolverRequest, _user: CurrentUser) -> WaterSolverResponse | JSONResponse:
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
def list_batches(user: CurrentUser, service: BatchServiceDep):
    """List the caller's batches (drafts and frozen)."""
    return service.list_batches(user["uid"])


@app.post("/batches", response_model=BatchRecord, status_code=201)
def create_batch(
    payload: DraftPayload,
    user: CurrentUser,
    service: BatchServiceDep,
):
    """Create a new draft."""
    return service.create_draft(user["uid"], payload)


@app.put("/batches/{batch_id}/draft", response_model=BatchRecord)
def update_draft(
    batch_id: str,
    payload: DraftPayload,
    user: CurrentUser,
    service: BatchServiceDep,
):
    """Autosave a draft's editable state (roots + collections)."""
    return service.update_draft(user["uid"], batch_id, payload)


@app.post("/batches/{batch_id}/freeze", response_model=BatchRecord, status_code=201)
def freeze_batch(
    batch_id: str,
    payload: FreezePayload,
    user: CurrentUser,
    service: BatchServiceDep,
):
    """Snapshot a draft's full valuation into an immutable frozen batch."""
    return service.freeze_batch(user["uid"], batch_id, payload)


@app.get("/batches/{batch_id}", response_model=BatchRecord)
def get_batch(
    batch_id: str,
    user: CurrentUser,
    service: BatchServiceDep,
):
    """Load a batch (draft or frozen) owned by the caller."""
    return service.get_batch(user["uid"], batch_id)
