"""Shared fixtures for backend boundary tests."""

from __future__ import annotations

import sys
from pathlib import Path

# Make `backend/` importable regardless of pytest's rootdir (the test suite
# lives at the repo root, outside the backend package).
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

import pytest

from app.schemas.boundary import (
    AcidMedium,
    BatchSolverRequest,
    BatchSpargeTopology,
    GristBillRow,
    IonProfile,
    PreferredAlkalineAgent,
    SaltDistribution,
    WaterGristRow,
    WaterSolverRequest,
    WaterStrategy,
)


def make_batch_request(**overrides) -> BatchSolverRequest:
    kwargs: dict = {
        "target_abv": 5.5,
        "apparent_attenuation": 0.75,
        "v_ferm": 20.0,
        "topology": BatchSpargeTopology.R_L_TO_G,
        "intensive_value": 3.0,
        "grain_bill": [GristBillRow(w_i=1.0, yield_i=0.80, mc_i=0.04)],
        "delta_v_evap": 3.0,
        "eta_conv": 0.95,
        "hlt_starting_volume_l": 25.0,
        "max_hlt_volume_l": 30.0,
    }
    kwargs.update(overrides)
    return BatchSolverRequest(**kwargs)


def make_water_request(**overrides) -> WaterSolverRequest:
    kwargs: dict = {
        "grist": [WaterGristRow(mass_kg=5.0, color_lovibond=3.0, grain_type="BASE")],
        "source": IonProfile(
            calcium_ca=10.0,
            magnesium_mg=2.0,
            sodium_na=8.0,
            sulfate_so4=5.0,
            chloride_cl=7.0,
            alkalinity_as_caco3=40.0,
        ),
        "target": IonProfile(
            calcium_ca=80.0,
            magnesium_mg=5.0,
            sodium_na=20.0,
            sulfate_so4=100.0,
            chloride_cl=50.0,
            alkalinity_as_caco3=0.0,
        ),
        "v_mash_treat_l": 15.0,
        "v_hlt_treat_l": 10.0,
        "v_sparge_demand_l": 8.0,
        "mash_thickness_l_per_kg": 3.0,
        "target_mash_ph": 5.35,
        "strategy": WaterStrategy.FLAVOR,
        "salt_distribution": SaltDistribution.PROPORTIONAL,
        "acid_medium": AcidMedium.LACTIC_88,
        "preferred_alkaline_agent": PreferredAlkalineAgent.BAKING_SODA,
    }
    kwargs.update(overrides)
    return WaterSolverRequest(**kwargs)


@pytest.fixture
def batch_request():
    return make_batch_request()


@pytest.fixture
def water_request():
    return make_water_request()


class FakeBatchRepo:

    def __init__(self):
        self._docs: dict[str, dict] = {}
        self._clock = 1.0

    def _now(self):
        self._clock += 1.0
        return self._clock

    def list_batches(self, uid):
        return sorted(
            [r for r in self._docs.values() if r["uid"] == uid],
            key=lambda r: r.get("updated_at", 0),
            reverse=True,
        )

    def get(self, uid, batch_id):
        r = self._docs.get(batch_id)
        return r if r and r["uid"] == uid else None

    def create(self, uid, batch_id, data):
        now = self._now()
        r = {
            "id": batch_id,
            "uid": uid,
            "status": "draft",
            "trashed": False,
            "created_at": now,
            "updated_at": now,
            **data,
        }
        self._docs[batch_id] = r
        return r

    def update(self, uid, batch_id, data):
        r = self._docs.get(batch_id)
        if not r or r["uid"] != uid:
            return None
        self._docs[batch_id] = {**r, **data, "updated_at": self._now()}
        return self._docs[batch_id]

    def apply_draft(self, uid, batch_id, data, base_updated_at):
        existing = self._docs.get(batch_id)
        if not existing or existing["uid"] != uid:
            now = self._now()
            r = {
                **data,
                "id": batch_id,
                "uid": uid,
                "status": "draft",
                "trashed": False,
                "created_at": now,
                "updated_at": now,
            }
            self._docs[batch_id] = r
            return r, None
        if existing["status"] != "draft":
            return existing, "frozen"
        if base_updated_at is not None and existing["updated_at"] != base_updated_at:
            return existing, "stale"
        updated = {**existing, **data, "updated_at": self._now()}
        self._docs[batch_id] = updated
        return updated, None

    def set_trashed(self, uid, batch_id, trashed):
        r = self._docs.get(batch_id)
        if not r or r["uid"] != uid:
            return None
        self._docs[batch_id] = {**r, "trashed": trashed, "updated_at": self._now()}
        return self._docs[batch_id]

    def rename(self, uid, batch_id, name):
        r = self._docs.get(batch_id)
        if not r or r["uid"] != uid:
            return None
        self._docs[batch_id] = {**r, "name": name, "updated_at": self._now()}
        return self._docs[batch_id]

    def delete(self, uid, batch_id):
        r = self._docs.get(batch_id)
        if not r or r["uid"] != uid:
            return False
        del self._docs[batch_id]
        return True

    def freeze(self, uid, batch_id, data):
        source = self._docs.get(batch_id)
        if not source or source["uid"] != uid:
            return None, "missing"
        if source["status"] != "draft":
            return source, "frozen"
        now = self._now()
        r = {
            "id": f"{batch_id}-frozen",
            "uid": uid,
            "name": source.get("name", "Untitled"),
            "status": "frozen",
            "trashed": False,
            "schema_version": data.get("schema_version", source.get("schema_version", 3)),
            "valuation": data.get("valuation", {}),
            "provenance": data.get("provenance", {}),
            "parent_batch_id": batch_id,
            "roots": source.get("roots", {}),
            "collections": source.get("collections", {}),
            "selections": source.get("selections", {}),
            "created_at": now,
            "updated_at": now,
            "frozen_at": now,
        }
        self._docs[r["id"]] = r
        return r, None
