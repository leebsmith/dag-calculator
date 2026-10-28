"""ADSCO smart router: classify the intent behind a target vector."""

from __future__ import annotations

from collections.abc import Sequence

from app.core.errors import SolverValidationError


def infer_adsco_mode(
    strategy: str,
    target: dict[str, float],
    custom_pinned_ions: Sequence[str],
) -> tuple[str, str, bool]:
    """Classify the user intent into one of the 5 ADSCO operational branches.

    Returns (resolved_mode, canonical_strategy_code, auto_fallback). The last
    element is True only when AUTO could not classify the target vector and
    fell through to the least-squares cloner.
    """
    clean_strat = strategy.upper().strip()

    if clean_strat in {"MODE_1", "MODE 1", "FLAVOR_ONLY"}:
        return "MODE_1", "CALCIUM_FLOOR", False
    if clean_strat in {"MODE_2", "MODE 2", "HYBRID"}:
        return "MODE_2", "HYBRID", False
    if clean_strat in {"MODE_3", "MODE 3", "OPTIMIZE", "CLONE"}:
        return "MODE_3", "OPTIMIZE", False
    if clean_strat in {"MODE_4", "MODE 4", "BASELINE", "NONE"}:
        return "MODE_4", "BASELINE", False
    if clean_strat in {"MODE_5", "MODE 5", "CUSTOM"}:
        return "MODE_5", "CUSTOM", False

    if clean_strat == "CALCIUM_FLOOR":
        return "MODE_1", "CALCIUM_FLOOR", False
    if clean_strat == "FLAVOR":
        return "MODE_1", "FLAVOR", False

    if clean_strat not in {"AUTO", ""}:
        raise SolverValidationError("UNKNOWN_STRATEGY", f"Unknown strategy {strategy!r}.")

    # AUTO Routing: evaluate target vector shape
    has_target = {k: v for k, v in target.items() if v is not None and v > 0.0}

    if not has_target:
        return "MODE_4", "BASELINE", False

    if custom_pinned_ions:
        return "MODE_5", "CUSTOM", False

    has_ca = "ca" in has_target
    has_mg = "mg" in has_target
    has_na = "na" in has_target
    has_alk = "alk" in has_target
    has_so4 = "so4" in has_target
    has_cl = "cl" in has_target

    # All 6 ions explicitly provided -> Mode 3 (Profile Cloning)
    if has_ca and has_mg and has_na and has_alk and has_so4 and has_cl:
        return "MODE_3", "OPTIMIZE", False

    # Flavor ions plus Alkalinity buffer -> Mode 2 (Ratio + Buffer)
    if (has_so4 or has_cl) and has_alk and not (has_ca or has_mg or has_na):
        return "MODE_2", "HYBRID", False

    # Only flavor ions (SO4, Cl, and optionally Na) -> Mode 1 (Linear Minimalist)
    if (has_so4 or has_cl or has_na) and not (has_ca or has_mg or has_alk):
        return "MODE_1", "CALCIUM_FLOOR", False

    # Any other arbitrary subset: no sparse equality set was named, so fall
    # through to the least-squares cloner rather than an unactionable state.
    return "MODE_3", "OPTIMIZE", True
