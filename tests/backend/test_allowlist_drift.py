"""The allowlist file and the deploy drift check agree on normalization."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parents[2]
ALLOWLIST = REPO_ROOT / "backend" / "allowlist.txt"


def load_drift_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "check_allowlist_drift", REPO_ROOT / "scripts" / "check_allowlist_drift.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


drift = load_drift_module()


def test_the_committed_allowlist_is_normalized_and_non_empty() -> None:
    entries = drift.parse_allowlist(ALLOWLIST.read_text(encoding="utf-8"))

    assert entries, "backend/allowlist.txt must contain at least one address"
    assert all(entry == entry.lower() and "@" in entry for entry in entries)


def test_the_file_and_the_env_value_parse_to_the_same_set() -> None:
    entries = drift.parse_allowlist(ALLOWLIST.read_text(encoding="utf-8"))

    assert drift.split_env_value(",".join(sorted(entries))) == entries


def test_the_parser_ignores_comments_and_blank_lines() -> None:
    text = "# production\n\n Leeb@Lee-Smith.org \n\n"

    assert drift.parse_allowlist(text) == {"leeb@lee-smith.org"}


def test_the_env_parser_accepts_every_separator() -> None:
    assert drift.split_env_value("a@x.org, b@x.org;c@x.org d@x.org") == {
        "a@x.org",
        "b@x.org",
        "c@x.org",
        "d@x.org",
    }
    assert drift.split_env_value(None) == set()


def test_the_serving_revision_is_the_one_with_the_most_traffic() -> None:
    service = {
        "status": {
            "traffic": [
                {"revisionName": "svc-00001-old", "percent": 10},
                {"revisionName": "svc-00002-live", "percent": 90},
            ]
        }
    }

    assert drift.serving_revision(service) == "svc-00002-live"
    assert drift.serving_revision({}) is None


def test_the_env_value_is_read_from_the_revision() -> None:
    revision = {
        "spec": {
            "containers": [
                {"env": [{"name": "GOOGLE_ENTRYPOINT", "value": "x"}, {"name": "ALLOWED_EMAILS", "value": "a@x.org"}]}
            ]
        }
    }

    assert drift.env_value(revision) == "a@x.org"
    assert drift.env_value({"spec": {"containers": [{"env": []}]}}) is None
