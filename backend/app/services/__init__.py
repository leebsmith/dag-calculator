"""Service layer: adapters between sealed core solvers and their Pydantic contracts."""

from app.services.batch_solver_service import solve_batch_request
from app.services.errors import SolverServiceError
from app.services.hop_solver_service import solve_hop_request
from app.services.water_solver_service import solve_water_request

__all__ = ["solve_batch_request", "solve_water_request", "solve_hop_request", "SolverServiceError"]
