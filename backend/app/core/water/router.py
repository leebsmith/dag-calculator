"""Strategy validation: the caller names the intent, and nothing is inferred."""

from __future__ import annotations

from app.core.errors import SolverValidationError

STRATEGIES = (
    "FLAVOR",
    "CALCIUM_FLOOR",
    "OPTIMIZE",
    "HYBRID",
    "BASELINE",
    "CUSTOM",
)


def resolve_strategy(strategy: str) -> str:
    """Return the canonical strategy code, or reject an unknown one."""
    clean = strategy.upper().strip()
    if clean not in STRATEGIES:
        accepted = ", ".join(STRATEGIES)
        raise SolverValidationError(
            "UNKNOWN_STRATEGY",
            f"Unknown strategy {strategy!r}. Expected one of: {accepted}.",
        )
    return clean
