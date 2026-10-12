"""FastAPI application: the JSON seam between the browser and the sealed solvers.

The browser never talks to Firestore directly; it POSTs JSON to these routes and
receives JSON back. Both boundary endpoints delegate to the pure service
adapters, which wrap the sealed ``app.core`` solvers.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.auth.deps import CurrentUser
from app.schemas.boundary import (
    BatchSolverRequest,
    BatchSolverResponse,
    SolverErrorResponse,
    WaterSolverRequest,
    WaterSolverResponse,
)
from app.services import SolverServiceError, solve_batch_request, solve_water_request

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
