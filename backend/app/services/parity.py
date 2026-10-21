"""Field-parity assertion between Pydantic request models and core dataclasses.

The service adapters hand-copy fields between a ``BatchSolverRequest`` (Pydantic)
and a ``BatchSolverInput`` (dataclass); a silent divergence — an input added to
one side only — would otherwise manifest as a missing argument or a silently
ignored value. ``assert_field_parity`` makes that divergence loud instead.
"""

from __future__ import annotations

import dataclasses
from typing import Any


def assert_field_parity(model: Any, dataclass_type: Any) -> None:
    """Assert the Pydantic model and the dataclass declare the same flat fields."""
    model_fields = set(model.model_fields)
    dataclass_fields = {field.name for field in dataclasses.fields(dataclass_type)}
    missing_in_model = dataclass_fields - model_fields
    missing_in_dataclass = model_fields - dataclass_fields
    if missing_in_model or missing_in_dataclass:
        raise AssertionError(
            f"field parity between {model.__name__} and {dataclass_type.__name__} failed: "
            f"missing in model={sorted(missing_in_model)}, "
            f"missing in dataclass={sorted(missing_in_dataclass)}"
        )
