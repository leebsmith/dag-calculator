"""ADSCO smart router: classify the intent behind a target vector."""

from __future__ import annotations

from collections.abc import Callable, Sequence

from app.core.errors import SolverValidationError

_STRATEGY_GROUPS: tuple[tuple[tuple[str, ...], str, str], ...] = (
    (("MODE_1", "MODE 1", "FLAVOR_ONLY"), "MODE_1", "CALCIUM_FLOOR"),
    (("MODE_2", "MODE 2", "HYBRID"), "MODE_2", "HYBRID"),
    (("MODE_3", "MODE 3", "OPTIMIZE", "CLONE"), "MODE_3", "OPTIMIZE"),
    (("MODE_4", "MODE 4", "BASELINE", "NONE"), "MODE_4", "BASELINE"),
    (("MODE_5", "MODE 5", "CUSTOM"), "MODE_5", "CUSTOM"),
    (("CALCIUM_FLOOR",), "MODE_1", "CALCIUM_FLOOR"),
    (("FLAVOR",), "MODE_1", "FLAVOR"),
)

_STRATEGY_MODES: dict[str, tuple[str, str]] = {
    alias: (mode, canonical) for aliases, mode, canonical in _STRATEGY_GROUPS for alias in aliases
}

_ALL_IONS = frozenset({"ca", "mg", "na", "alk", "so4", "cl"})
_FLAVOR_IONS = frozenset({"so4", "cl"})
_RESIDUAL_IONS = frozenset({"ca", "mg", "na"})
_CA_MG_ALK_IONS = frozenset({"ca", "mg", "alk"})
_AUTO_STRATEGIES = frozenset({"AUTO", ""})


def _held_ions(target: dict[str, float]) -> set[str]:
    return {ion for ion, ppm in target.items() if ppm is not None and ppm > 0.0}


def _is_full_profile(held: set[str]) -> bool:
    return _ALL_IONS <= held


def _is_ratio_with_buffer(held: set[str]) -> bool:
    return bool(held & _FLAVOR_IONS) and "alk" in held and not (held & _RESIDUAL_IONS)


def _is_sparse_flavor(held: set[str]) -> bool:
    return bool(held & (_FLAVOR_IONS | {"na"})) and not (held & _CA_MG_ALK_IONS)


_AUTO_RULES: tuple[tuple[Callable[[set[str]], bool], str, str], ...] = (
    (_is_full_profile, "MODE_3", "OPTIMIZE"),
    (_is_ratio_with_buffer, "MODE_2", "HYBRID"),
    (_is_sparse_flavor, "MODE_1", "CALCIUM_FLOOR"),
)


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
    explicit = _STRATEGY_MODES.get(clean_strat)
    if explicit is not None:
        return (*explicit, False)

    if clean_strat not in _AUTO_STRATEGIES:
        raise SolverValidationError("UNKNOWN_STRATEGY", f"Unknown strategy {strategy!r}.")

    held = _held_ions(target)
    if not held:
        return "MODE_4", "BASELINE", False

    if custom_pinned_ions:
        return "MODE_5", "CUSTOM", False

    for matches, mode, canonical in _AUTO_RULES:
        if matches(held):
            return mode, canonical, False

    return "MODE_3", "OPTIMIZE", True
