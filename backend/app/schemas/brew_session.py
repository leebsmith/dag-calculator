"""Pydantic models for brew sessions (the execution log beside a frozen batch)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

SessionLevel = Literal["critical", "info", "debug"]
SessionStatus = Literal["planned", "brewing", "fermenting", "packaging", "complete", "sealed"]
ObservationSource = Literal["live", "paper", "import"]


class ObservationValue(BaseModel):
    value: float
    unit: str


class ObservationCreate(BaseModel):
    metric_id: str
    step_id: str | None = None
    at: float
    source: ObservationSource = "live"
    method: str
    raw: ObservationValue
    corrected: ObservationValue | None = None
    correction: dict[str, Any] | None = None
    note: str = ""


class Observation(ObservationCreate):
    id: str
    recorded_at: float
    supersedes: str | None = None
    void: bool = False


class ObservationPatch(BaseModel):
    note: str | None = None
    void: bool | None = None
    corrected: ObservationValue | None = None
    correction: dict[str, Any] | None = None


class BrewSessionCreate(BaseModel):
    batch_id: str
    level: SessionLevel = "info"
    started_at: float | None = None
    plan_snapshot: dict[str, Any]


class BrewSessionPatch(BaseModel):
    status: SessionStatus | None = None
    ended_at: float | None = None
    steps: dict[str, dict[str, Any]] | None = None
    notes: str | None = None


class BrewSession(BaseModel):
    id: str
    uid: str
    batch_id: str
    batch_name: str
    artifact_hash: str
    frozen_at: float
    level: SessionLevel
    status: SessionStatus
    started_at: float
    ended_at: float | None = None
    finalized_at: float | None = None
    plan_snapshot: dict[str, Any] = Field(default_factory=dict)
    steps: dict[str, dict[str, Any]] = Field(default_factory=dict)
    observations: list[Observation] = Field(default_factory=list)
    notes: str = ""
    created_at: float
    updated_at: float
