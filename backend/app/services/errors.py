"""Service-layer error types for the sealed boundary adapters."""

from __future__ import annotations


class SolverServiceError(Exception):
    """A typed boundary failure, carrying the error-surface code.

    Raised by the service adapters when the sealed core solvers raise
    ``SolverValidationError``; the FastAPI layer maps this onto a
    ``SolverErrorResponse`` (HTTP 422).
    """

    def __init__(self, code: str, message: str, details: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}
