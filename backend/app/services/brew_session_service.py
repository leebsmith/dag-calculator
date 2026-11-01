"""Brew-session business logic: create, update, observe, finalize."""

from __future__ import annotations

import time
import uuid
from typing import Annotated

from fastapi import Depends, HTTPException

from app.repositories.batch_repo import BatchRepoDep, BatchRepository
from app.repositories.brew_session_repo import BrewSessionRepoDep, BrewSessionRepository
from app.schemas.brew_session import (
    BrewSession,
    BrewSessionCreate,
    BrewSessionPatch,
    Observation,
    ObservationCreate,
    ObservationPatch,
)
from app.services.report_render import RenderedReport, render_session


class BrewSessionService:
    def __init__(self, repo: BrewSessionRepository, batch_repo: BatchRepository) -> None:
        self._repo = repo
        self._batch_repo = batch_repo

    def list_sessions(self, uid: str, batch_id: str | None = None) -> list[BrewSession]:
        return [BrewSession(**row) for row in self._repo.list_sessions(uid, batch_id)]

    def get_session(self, uid: str, session_id: str) -> BrewSession:
        row = self._repo.get(uid, session_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Brew session not found")
        return BrewSession(**row)

    def create_session(self, uid: str, payload: BrewSessionCreate) -> BrewSession:
        batch = self._batch_repo.get(uid, payload.batch_id)
        if batch is None:
            raise HTTPException(status_code=404, detail="Batch not found")
        if batch.get("status") != "frozen":
            raise HTTPException(
                status_code=409,
                detail="Brew sessions start from a frozen batch; freeze the recipe first",
            )
        if not isinstance(payload.plan_snapshot.get("table"), list):
            raise HTTPException(
                status_code=422,
                detail="plan_snapshot.table must be the frozen checklist table",
            )
        bundle = self._batch_repo.get_report_bundle(uid, payload.batch_id) or {}
        artifact_hash = (bundle.get("artifact") or {}).get("hash", "")
        now = time.time()
        record = {
            "batch_id": payload.batch_id,
            "batch_name": batch.get("name", "Untitled"),
            "artifact_hash": artifact_hash,
            "frozen_at": batch.get("frozen_at") or now,
            "level": payload.level,
            "status": "planned",
            "started_at": payload.started_at if payload.started_at is not None else now,
            "ended_at": None,
            "finalized_at": None,
            "plan_snapshot": payload.plan_snapshot,
            "steps": {},
            "observations": [],
            "notes": "",
        }
        return BrewSession(**self._repo.create(uid, uuid.uuid4().hex, record))

    def patch_session(
        self, uid: str, session_id: str, payload: BrewSessionPatch
    ) -> BrewSession:
        current = self.get_session(uid, session_id)
        if current.finalized_at is not None:
            raise HTTPException(
                status_code=409, detail="A sealed session is append-only"
            )
        data = payload.model_dump(exclude_none=True)
        row = self._repo.update(uid, session_id, data)
        if row is None:
            raise HTTPException(status_code=404, detail="Brew session not found")
        return BrewSession(**row)

    def add_observation(
        self, uid: str, session_id: str, payload: ObservationCreate
    ) -> BrewSession:
        current = self.get_session(uid, session_id)
        if current.finalized_at is not None:
            raise HTTPException(
                status_code=409, detail="A sealed session is append-only"
            )
        observation = Observation(
            **payload.model_dump(),
            id=uuid.uuid4().hex,
            recorded_at=time.time(),
        )
        row = self._repo.update(
            uid,
            session_id,
            {"observations": [*current.observations, observation]},
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Brew session not found")
        return BrewSession(**row)

    def patch_observation(
        self,
        uid: str,
        session_id: str,
        observation_id: str,
        payload: ObservationPatch,
    ) -> BrewSession:
        current = self.get_session(uid, session_id)
        if current.finalized_at is not None:
            raise HTTPException(
                status_code=409, detail="A sealed session is append-only"
            )
        found = False
        observations = []
        for observation in current.observations:
            if observation.id != observation_id:
                observations.append(observation)
                continue
            found = True
            update = payload.model_dump(exclude_none=True)
            observations.append(observation.model_copy(update=update))
        if not found:
            raise HTTPException(status_code=404, detail="Observation not found")
        row = self._repo.update(uid, session_id, {"observations": observations})
        if row is None:
            raise HTTPException(status_code=404, detail="Brew session not found")
        return BrewSession(**row)

    def render_session_report(
        self, uid: str, session_id: str, paper: str = "a4"
    ) -> RenderedReport:
        session = self.get_session(uid, session_id)
        return render_session(session.model_dump(mode="json"), paper=paper)

    def finalize_session(self, uid: str, session_id: str) -> BrewSession:
        current = self.get_session(uid, session_id)
        if current.finalized_at is not None:
            return current
        now = time.time()
        row = self._repo.update(
            uid,
            session_id,
            {"status": "sealed", "ended_at": now, "finalized_at": now},
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Brew session not found")
        return BrewSession(**row)


def get_brew_session_service(
    repo: BrewSessionRepoDep, batch_repo: BatchRepoDep
) -> BrewSessionService:
    return BrewSessionService(repo, batch_repo)


BrewSessionServiceDep = Annotated[BrewSessionService, Depends(get_brew_session_service)]
